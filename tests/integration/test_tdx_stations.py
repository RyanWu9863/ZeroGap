"""TDX 車站匯入：用 respx 模擬 TDX（實際抓到的資料），寫進測試資料庫。"""

import json
from datetime import date
from pathlib import Path

import httpx
import pytest
import redis
import respx
from sqlalchemy import text

from app.collectors.tdx_stations import refresh_stations
from app.config import Settings
from app.jobs.crawl import run_crawl
from app.tdx import BASIC_URL, TOKEN_URL, TdxTransit
from tests.integration.conftest import reseed

FIXTURES = Path(__file__).parent.parent / "fixtures" / "tdx"
SETTINGS = Settings(_env_file=None, tdx_per_minute=1000)


def fixture(name):
    return json.loads((FIXTURES / f"stations_{name}.json").read_text(encoding="utf-8"))


@pytest.fixture
def r(redis_url):
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    client.flushdb()
    yield client
    client.flushdb()


@pytest.fixture(autouse=True)
def clean(engine):
    reseed(engine, date(2026, 10, 22))
    yield
    with engine.begin() as c:
        c.execute(text("DELETE FROM stations WHERE station_uid NOT LIKE 'demo-%'"))
        c.execute(text("DELETE FROM crawl_runs WHERE job = 'tdx_stations'"))
    reseed(engine, date(2026, 10, 22))  # 示意車站恢復啟用


def mock_tdx(tra=None):
    respx.post(TOKEN_URL).mock(
        return_value=httpx.Response(200, json={"access_token": "t", "expires_in": 86400})
    )
    respx.get(f"{BASIC_URL}/v2/Rail/TRA/Station").mock(
        return_value=httpx.Response(200, json=fixture("tra") if tra is None else tra)
    )
    respx.get(f"{BASIC_URL}/v2/Rail/THSR/Station").mock(
        return_value=httpx.Response(200, json=fixture("thsr"))
    )
    respx.get(f"{BASIC_URL}/v2/Rail/Metro/Station/TYMC").mock(
        return_value=httpx.Response(200, json=fixture("tymc"))
    )
    respx.get(url__regex=rf"{BASIC_URL}/v2/Rail/Metro/Station/.*").mock(
        return_value=httpx.Response(200, json=[])
    )


def run(session, r):
    tdx = TdxTransit("id", "secret", r, sleep=lambda s: None)
    return run_crawl(
        session, r, "refresh_stations", "tdx_stations",
        lambda keep_alive: refresh_stations(session, r, tdx, SETTINGS, keep_alive),
    )  # fmt: skip


@respx.mock
def test_import_replaces_demo_stations(session, r):
    mock_tdx()
    stats = run(session, r)
    # 測試資料：台鐵 12 站、高鐵 8 站、機捷 8 站，其他系統是空的
    assert stats["by_operator"] == {
        "TRA": 12, "THSR": 8, "TRTC": 0, "KRTC": 0, "TYMC": 8,
        "KLRT": 0, "NTDLRT": 0, "TMRT": 0, "NTMC": 0, "NTALRT": 0,
    }  # fmt: skip
    assert stats["upserted"] == 28
    assert stats["demo_deactivated"] == 13
    active = (
        session.execute(text("SELECT station_uid FROM stations WHERE is_active")).scalars().all()
    )
    assert active and not [u for u in active if u.startswith("demo-")]
    names = set(session.scalars(text("SELECT name FROM stations WHERE is_active")))
    assert {"中壢", "桃園", "三重站"} <= names
    run_row = session.execute(
        text("SELECT status, stats FROM crawl_runs WHERE job = 'tdx_stations'")
    ).one()
    assert run_row.status == "success"
    assert int(r.get(next(iter(r.keys("quota:tdx_points:*"))))) == 2 * 10  # 10 個系統各 2 單位


@respx.mock
def test_second_run_is_idempotent_and_drops_removed_stations(session, r):
    mock_tdx()
    first = run(session, r)
    tra = fixture("tra")
    removed = tra[0]["StationUID"]
    respx.reset()
    mock_tdx(tra=tra[1:])
    r.delete("lock:job:refresh_stations")
    second = run(session, r)
    assert second["upserted"] == first["upserted"] - 1
    assert second["deactivated"] == 1
    active = session.scalar(
        text("SELECT is_active FROM stations WHERE station_uid = :u"), {"u": removed}
    )
    assert active is False


@respx.mock
def test_failed_system_keeps_its_stations(session, r):
    mock_tdx()
    run(session, r)
    respx.reset()
    mock_tdx()
    respx.get(f"{BASIC_URL}/v2/Rail/TRA/Station").mock(return_value=httpx.Response(500))
    stats = run(session, r)
    assert "TRA" in stats["failed"]
    zhongli = session.scalar(text("SELECT is_active FROM stations WHERE name = '中壢' "
                                  "AND station_uid LIKE 'TRA-%'"))  # fmt: skip
    assert zhongli is True


def test_lock_prevents_parallel_runs(session, r):
    r.set("lock:job:refresh_stations", "someone-else", px=60_000)
    assert run(session, r) is None
