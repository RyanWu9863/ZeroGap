"""MCP 伺服器（規格書 6.6）：用官方 SDK 的 Client 在記憶體裡連線；worker 在背景執行緒跑。"""

import json
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import redis
from mcp import Client
from rq import SimpleWorker
from rq.timeouts import TimerDeathPenalty
from sqlalchemy import text

import app.db
import app.redis_client
from app.config import get_settings
from app.mcp import mcp
from tests.integration.conftest import reseed

TZ = ZoneInfo("Asia/Taipei")
TODAY = datetime.now(TZ).date()
TOMORROW = TODAY + timedelta(days=1)
CACHED = (
    get_settings,
    app.db.sync_engine,
    app.db.async_engine,
    app.redis_client.sync_redis,
    app.redis_client.async_redis,
    app.redis_client.rq_redis,
)


@pytest.fixture(scope="module", autouse=True)
def seeded(engine):
    reseed(engine, TODAY)


@pytest.fixture
def env(monkeypatch, db_url, redis_url):
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("REDIS_URL", redis_url)
    monkeypatch.setenv("LLM_MODE", "mock")
    monkeypatch.setenv("TDX_PER_MINUTE", "1000")
    for f in CACHED:
        f.cache_clear()
    redis.Redis.from_url(redis_url).flushdb()
    yield
    redis.Redis.from_url(redis_url).flushdb()
    for f in CACHED:
        f.cache_clear()


@asynccontextmanager
async def connect():
    """連線要在同一個 task 裡開關（anyio 的限制），所以不放在 fixture。"""
    try:
        async with Client(mcp) as c:
            yield c
    finally:
        await app.db.async_engine().dispose()
        await app.redis_client.async_redis().aclose()


def data(result):
    assert not result.is_error, result.content
    if result.structured_content is not None:
        sc = result.structured_content
        return sc["result"] if set(sc) == {"result"} else sc
    return json.loads(result.content[0].text)


class ThreadWorker(SimpleWorker):
    death_penalty_class = TimerDeathPenalty

    def _install_signal_handlers(self):
        pass


@pytest.fixture
def worker(env, redis_url):
    stop = threading.Event()

    def loop():
        conn = redis.Redis.from_url(redis_url)
        while not stop.is_set():
            ThreadWorker(["plans"], connection=conn).work(burst=True)
            time.sleep(0.2)

    t = threading.Thread(target=loop, daemon=True)
    t.start()
    yield
    stop.set()
    t.join(timeout=10)


def plan_args(sid, **overrides):
    args = {
        "area": "taoyuan", "origin_station_id": sid, "date": TOMORROW.isoformat(),
        "earliest_departure": "17:00", "latest_home": "23:00", "order": "movie_first",
        "budget_per_person": 1500, "max_walk_minutes": 12,
    }  # fmt: skip
    args.update(overrides)
    return args


async def test_five_tools_with_instructions(env):
    async with connect() as client:
        tools = {t.name for t in (await client.list_tools()).tools}
        instructions = client.instructions
    assert tools == {"list_areas", "list_stations", "list_categories", "data_coverage", "plan_date"}
    assert "plan_date" in (instructions or "")


async def test_lookup_tools(env):
    async with connect() as client:
        areas = data(await client.call_tool("list_areas", {"county": "Taoyuan"}))
        stations = data(await client.call_tool("list_stations", {"county": "Taoyuan"}))
        cuisines = data(await client.call_tool("list_categories", {"kind": "cuisine"}))
        coverage = data(await client.call_tool("data_coverage", {"area": "taoyuan"}))
    assert {a["code"] for a in areas["areas"] if a["is_open"]} >= {"taoyuan", "zhongli"}
    assert any(s["name"] == "中壢" for s in stations)
    assert {"code": "japanese", "label": "日式"} in cuisines
    assert TOMORROW.isoformat() in coverage["available_dates"]


async def test_unknown_county_is_tool_error(env):
    async with connect() as client:
        result = await client.call_tool("list_stations", {"county": "Nowhere"})
    assert result.is_error
    assert "NOT_FOUND" in result.content[0].text


async def test_plan_date_reports_progress_and_returns_result(env, worker, engine):
    with engine.connect() as c:
        sid = c.scalar(text("SELECT id FROM stations WHERE station_uid = 'demo-TRA-zhongli'"))
    messages = []

    async def on_progress(progress, total, message):
        messages.append(message)

    async with connect() as client:
        result = await client.call_tool(
            "plan_date", plan_args(sid), progress_callback=on_progress, read_timeout_seconds=120
        )
    out = data(result)
    assert out["plans"][0]["highlight"]["key"] == "recommended"
    assert any(m.startswith("排隊中") for m in messages)
    assert any("種組合" in m for m in messages)


async def test_plan_date_validation_error(env):
    async with connect() as client:
        result = await client.call_tool("plan_date", plan_args(1, latest_home="03:00"))
    assert result.is_error
    assert "VALIDATION_ERROR" in result.content[0].text
