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


async def test_six_tools_with_instructions(env):
    async with connect() as client:
        tools = {t.name for t in (await client.list_tools()).tools}
        instructions = client.instructions
    assert tools == {"list_areas", "list_stations", "search_locations", "list_categories",
                     "data_coverage", "plan_date"}  # fmt: skip
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


async def test_plan_date_schema_defaults(env):
    # 走路上限只有 MCP 有預設，AI 沒填也能排；站名可以直接填（2026-10-29 mcp-eval v3）
    async with connect() as client:
        tools = {t.name: t for t in (await client.list_tools()).tools}
    schema = tools["plan_date"].input_schema
    assert "max_walk_minutes" not in schema["required"]
    assert schema["properties"]["max_walk_minutes"]["default"] == 12
    assert "origin_station_name" in schema["properties"]


async def test_station_name_becomes_id(env, engine):
    from app.mcp import prepare_plan

    with engine.connect() as c:
        ids = dict(c.execute(text("SELECT station_uid, id FROM stations")).all())
    base = plan_args(None)
    del base["max_walk_minutes"]
    try:
        for name, uid in [
            ("中壢站", "demo-TRA-zhongli"),
            ("中壢", "demo-TRA-zhongli"),
            ("桃園火車站", "demo-TRA-taoyuan"),
            ("高鐵桃園站", "demo-THSR-taoyuan"),  # 也有叫「高鐵桃園站」的捷運站，看「高鐵」挑
        ]:
            req = await prepare_plan({**base, "origin_station_name": name, "max_walk_minutes": 12})
            assert req.origin_station_id == ids[uid], name
    finally:
        await app.db.async_engine().dispose()


async def test_station_name_ambiguous_or_unknown(env):
    async with connect() as client:
        ambiguous = await client.call_tool(
            "plan_date", plan_args(None, origin_station_name="桃園站")
        )
        unknown = await client.call_tool(
            "plan_date", plan_args(None, origin_station_name="台北車站")
        )
    assert ambiguous.is_error and "AMBIGUOUS：「桃園站」有 2 個站" in ambiguous.content[0].text
    assert "THSR" in ambiguous.content[0].text and "TRA" in ambiguous.content[0].text
    assert unknown.is_error and "NOT_FOUND：找不到叫「台北車站」的車站" in unknown.content[0].text


async def test_validation_error_names_the_field(env):
    # PlanRequest 的錯誤附上欄位名稱。工具簽名本身的必填欄位（例如 order）漏填時，
    # SDK 在呼叫工具之前就擋下，訊息是 pydantic 原本的格式，不會走到 validation_error_text
    async with connect() as client:
        result = await client.call_tool("plan_date", plan_args(1, budget_per_person=0))
    assert result.is_error
    assert "VALIDATION_ERROR：budget_per_person：" in result.content[0].text


async def test_error_result_releases_the_lock(env, worker, redis_url):
    # 工具在 async for 裡 raise 時，generator 要馬上收尾，不然這個 IP 會一直 PLAN_IN_PROGRESS
    # （2026-10-29 mcp-eval 端到端發現，用 aclosing 修好）
    args = plan_args(None, origin_station_name="中壢站", budget_per_person=100)
    del args["max_walk_minutes"]
    async with connect() as client:
        result = await client.call_tool("plan_date", args, read_timeout_seconds=120)
        assert result.is_error and "NO_FEASIBLE：" in result.content[0].text
        assert redis.Redis.from_url(redis_url).keys("active:plan:*") == []
