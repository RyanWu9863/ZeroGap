"""REST API 與 SSE（規格書 6.1～6.5）。用 httpx 直接打 ASGI app，worker 在背景執行緒跑。"""

import json
import threading
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
import redis
from rq import SimpleWorker
from rq.timeouts import TimerDeathPenalty
from sqlalchemy import text

import app.db
import app.redis_client
from app.config import Settings, get_settings
from app.jobs.queue import plans_queue
from app.main import app as fastapi_app
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
async def client(monkeypatch, db_url, redis_url):
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("REDIS_URL", redis_url)
    monkeypatch.setenv("LLM_MODE", "mock")
    monkeypatch.setenv("TDX_PER_MINUTE", "1000")
    for f in CACHED:
        f.cache_clear()
    r = redis.Redis.from_url(redis_url)
    r.flushdb()
    transport = httpx.ASGITransport(app=fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    fastapi_app.dependency_overrides.clear()
    await app.db.async_engine().dispose()
    await app.redis_client.async_redis().aclose()
    r.flushdb()
    for f in CACHED:
        f.cache_clear()


def override(**values):
    fastapi_app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, **values)


def station_id(engine, uid="demo-TRA-zhongli"):
    with engine.connect() as c:
        return c.scalar(text("SELECT id FROM stations WHERE station_uid = :u"), {"u": uid})


def plan_body(engine, **overrides):
    body = {
        "area": "taoyuan", "origin_station_id": station_id(engine), "date": TOMORROW.isoformat(),
        "earliest_departure": "17:00", "latest_home": "23:00", "order": "movie_first",
        "movie_id": None, "movie_genre": None, "hall_type": None, "language": None,
        "cuisine": None, "budget_per_person": 1500, "max_walk_minutes": 12,
    }  # fmt: skip
    body.update(overrides)
    return body


def parse_sse(raw: str) -> list[tuple[str, dict]]:
    events = []
    for block in raw.split("\n\n"):
        lines = [x for x in block.splitlines() if x and not x.startswith(":")]
        if not lines:
            continue
        name = next(x[7:] for x in lines if x.startswith("event: "))
        data = json.loads(next(x[6:] for x in lines if x.startswith("data: ")))
        events.append((name, data))
    return events


class ThreadWorker(SimpleWorker):
    """測試用：不 fork、不註冊訊號，才能在背景執行緒跑。"""

    death_penalty_class = TimerDeathPenalty

    def _install_signal_handlers(self):
        pass


@pytest.fixture
def worker(client, redis_url):
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


# ── 下拉選單 ─────────────────────────────────────────────────


async def test_counties(client):
    res = await client.get("/api/counties")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 22
    by_code = {c["code"]: c for c in data}
    assert by_code["Taoyuan"] == {"code": "Taoyuan", "name": "桃園市", "has_open_areas": True}
    assert by_code["Taipei"]["has_open_areas"] is False


async def test_areas(client):
    res = await client.get("/api/areas", params={"county": "Taoyuan"})
    assert [a["code"] for a in res.json()] == ["taoyuan", "zhongli", "qingpu", "bade", "luzhu"]
    assert res.json()[0] == {"code": "taoyuan", "name": "桃園區", "is_open": True}
    by_code = {a["code"]: a for a in res.json()}
    # 2026-10-20 決定：青埔先不開放，新增蘆竹（南崁）
    assert by_code["qingpu"]["is_open"] is False
    assert by_code["luzhu"] == {"code": "luzhu", "name": "蘆竹（南崁）", "is_open": True}


async def test_unknown_county_is_404_with_error_format(client):
    res = await client.get("/api/areas", params={"county": "Nowhere"})
    assert res.status_code == 404
    assert res.json() == {"error": {"code": "NOT_FOUND", "message": "縣市 Nowhere 不存在"}}


async def test_stations(client):
    res = await client.get("/api/stations", params={"county": "Taoyuan"})
    names = {s["name"] for s in res.json()}
    assert {"中壢", "桃園", "高鐵桃園站"} <= names
    assert "臺北" not in names
    assert set(res.json()[0]) == {"id", "name", "operator"}


async def test_stations_requires_county(client):
    res = await client.get("/api/stations")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_categories(client):
    res = await client.get("/api/categories", params={"kind": "cuisine"})
    assert [c["code"] for c in res.json()] == [
        "western", "chinese", "american", "japanese", "korean", "other"
    ]  # fmt: skip
    bad = await client.get("/api/categories", params={"kind": "drinks"})
    assert bad.status_code == 400


async def test_coverage(client):
    res = await client.get("/api/coverage", params={"area": "taoyuan"})
    data = res.json()
    assert TOMORROW.isoformat() in data["available_dates"]
    assert (TODAY + timedelta(days=3)).isoformat() not in data["available_dates"]  # 第 4 天空著
    assert data["movies"] == [] and data["restaurant_source"] == "google"
    # 料理跟日期無關，不指定日期也列：只列排得進行程的店有的料理
    assert {"code": "japanese", "label": "日式"} in data["cuisines"]

    res = await client.get(
        "/api/coverage", params={"area": "taoyuan", "date": TOMORROW.isoformat()}
    )
    data = res.json()
    assert data["movies"] and set(data["movies"][0]) == {"id", "title", "genre", "runtime_min"}
    assert {"code": "standard", "label": "一般數位"} in data["hall_types"]
    assert all(set(g) == {"code", "label"} for g in data["genres"])
    assert data["languages"]


async def test_restaurant_source_matches_the_planner(client, redis_url):
    # 額度剩不到一次規劃要查的量，規劃就改用 OSM，這裡也要說 osm（2026-10-24）
    from app.redis_utils.quota import add_usage

    add_usage(redis.Redis.from_url(redis_url), "google:details_enterprise", 945)
    for path in ("/api/coverage?area=taoyuan", "/api/status"):
        assert (await client.get(path)).json()["restaurant_source"] == "osm"


async def test_coverage_unknown_area(client):
    res = await client.get("/api/coverage", params={"area": "taipei101"})
    assert res.status_code == 404


async def test_status(client):
    data = (await client.get("/api/status")).json()
    assert data["jev"] == {"mode": "mock", "model": "jev-mock-1"}
    assert data["llm"]["connected"] is False  # LLM_MODE=mock
    assert set(data["data_updated_at"]) == {"atmovies", "osm", "google_places", "tdx_stations"}
    assert data["data_updated_at"]["atmovies"].endswith("+08:00")
    assert data["data_updated_at"]["google_places"] is None
    assert data["restaurant_source"] == "google"


async def test_health(client):
    assert (await client.get("/api/health")).json() == {"status": "ok"}


async def test_unknown_path_uses_error_format(client):
    res = await client.get("/api/nope")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"


async def test_read_rate_limit(client):
    override(api_read_per_minute=3)
    for _ in range(3):
        assert (await client.get("/api/counties")).status_code == 200
    res = await client.get("/api/counties")
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "RATE_LIMITED"
    assert 0 < int(res.headers["Retry-After"]) <= 60


async def test_cors(client):
    res = await client.options(
        "/api/counties",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"
    res = await client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in res.headers


# ── POST /api/plans：送出前的檢查 ────────────────────────────────


@pytest.mark.parametrize(
    ("overrides", "status", "code"),
    [
        ({"max_walk_minutes": 7}, 400, "VALIDATION_ERROR"),
        ({"latest_home": "03:00"}, 400, "VALIDATION_ERROR"),
        ({"earliest_departure": "1700"}, 400, "VALIDATION_ERROR"),
        ({"date": (TODAY + timedelta(days=3)).isoformat()}, 400, "VALIDATION_ERROR"),
        ({"origin_station_id": 999999}, 404, "NOT_FOUND"),
        # 出發點二擇一（2026-10-21）：兩個都給、都沒給、座標只給一半
        ({"origin_lat": 24.99, "origin_lng": 121.31}, 400, "VALIDATION_ERROR"),
        ({"origin_station_id": None}, 400, "VALIDATION_ERROR"),
        ({"origin_station_id": None, "origin_lat": 24.99}, 400, "VALIDATION_ERROR"),
        # 名稱只能跟座標一起給
        ({"origin_name": "家"}, 400, "VALIDATION_ERROR"),
        # 新竹離桃園的商圈超過 30 公里
        (
            {"origin_station_id": None, "origin_lat": 24.80, "origin_lng": 120.97},
            400,
            "VALIDATION_ERROR",
        ),
        ({"area": "nowhere"}, 404, "NOT_FOUND"),
        ({"movie_id": 999999}, 404, "NOT_FOUND"),
        ({"cuisine": "martian"}, 400, "VALIDATION_ERROR"),
        ({"date": TODAY.isoformat(), "earliest_departure": "00:01"}, 400, "VALIDATION_ERROR"),
    ],
)
async def test_plan_validation(client, engine, overrides, status, code):
    res = await client.post("/api/plans", json=plan_body(engine, **overrides))
    assert res.status_code == status, res.text
    assert res.json()["error"]["code"] == code


async def test_plan_in_progress(client, engine, redis_url):
    redis.Redis.from_url(redis_url).set("active:plan:127.0.0.1", "other-job", ex=60)
    res = await client.post("/api/plans", json=plan_body(engine))
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "PLAN_IN_PROGRESS"


async def test_queue_full(client, engine, redis_url):
    conn = redis.Redis.from_url(redis_url)
    for _ in range(5):
        plans_queue(conn).enqueue("builtins.print", "x")
    res = await client.post("/api/plans", json=plan_body(engine))
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "QUEUE_FULL"
    assert res.headers["Retry-After"] == "60"
    assert not conn.exists("active:plan:127.0.0.1")  # 被擋下時要清掉「規劃中」的標記


async def test_hourly_plan_limit(client, engine, redis_url):
    override(api_plan_per_hour=0)
    res = await client.post("/api/plans", json=plan_body(engine))
    assert res.status_code == 429
    assert "Retry-After" in res.headers
    assert not redis.Redis.from_url(redis_url).exists("active:plan:127.0.0.1")


# ── POST /api/plans：SSE ────────────────────────────────────────


async def test_plan_stream_end_to_end(client, engine, worker, redis_url):
    res = await client.post("/api/plans", json=plan_body(engine), timeout=60)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert res.headers["x-accel-buffering"] == "no"

    events = parse_sse(res.text)
    names = [n for n, _ in events]
    assert names[0] == "queued"
    assert events[0][1]["position"] >= 1
    assert names[-1] == "result"
    assert "progress" in names
    filtering = next(d for n, d in events if n == "progress" and d["stage"] == "filtering")
    assert filtering["combinations"] > 0

    result = events[-1][1]
    assert result["job_id"] == events[0][1]["job_id"]
    assert result["plans"][0]["highlight"]["key"] == "recommended"
    # 串流結束後釋放「規劃中」的標記，可以再送一次
    assert not redis.Redis.from_url(redis_url).exists("active:plan:127.0.0.1")


async def test_plan_stream_error_event(client, engine, worker):
    res = await client.post("/api/plans", json=plan_body(engine, budget_per_person=100), timeout=60)
    events = parse_sse(res.text)
    name, data = events[-1]
    assert name == "error"
    assert data["code"] == "NO_FEASIBLE"
    assert data["reasons"]["budget"] > 0


# ── GET /api/locations：自選的出發位置（2026-10-21） ─────────────────


async def test_locations_search_mock(client):
    # TDX_MODE=mock：從車站、代表點、影城的名稱找
    res = await client.get("/api/locations", params={"q": "中壢"})
    assert res.status_code == 200, res.text
    hits = res.json()
    assert hits and all({"name", "address", "lat", "lng"} <= h.keys() for h in hits)
    assert any("中壢" in h["name"] for h in hits)


async def test_locations_validation_and_area_filter(client):
    assert (await client.get("/api/locations", params={"q": "中"})).status_code == 400
    res = await client.get("/api/locations", params={"q": "中壢", "area": "nowhere"})
    assert res.status_code == 404
    res = await client.get("/api/locations", params={"q": "中壢", "area": "taoyuan"})
    assert res.status_code == 200 and res.json()


async def test_locations_rate_limited_per_hour(client):
    override(api_location_search_per_hour=2)
    for _ in range(2):
        assert (await client.get("/api/locations", params={"q": "中壢"})).status_code == 200
    res = await client.get("/api/locations", params={"q": "中壢"})
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "RATE_LIMITED"
