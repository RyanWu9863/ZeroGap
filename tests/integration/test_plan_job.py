"""RQ 規劃工作與佇列（規格書 5.6、5.7）。"""

import json
import uuid
from datetime import date

import pytest
import redis
from rq import SimpleWorker
from rq.timeouts import TimerDeathPenalty
from sqlalchemy import text

from app.config import get_settings
from app.jobs.plan_job import channel
from app.jobs.queue import (
    QueueFull,
    cancel_plan,
    enqueue_plan,
    job_status,
    plans_queue,
    queue_position,
)
from tests.integration.conftest import reseed

DAY = date(2026, 10, 22)


@pytest.fixture
def env(monkeypatch, db_url, redis_url, engine):
    """讓 worker 裡的 get_settings() 指向測試用的資料庫和 Redis。"""
    import app.db
    import app.redis_client

    reseed(engine, DAY)
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("REDIS_URL", redis_url)
    monkeypatch.setenv("LLM_MODE", "mock")
    monkeypatch.setenv("TDX_PER_MINUTE", "1000")
    for f in (get_settings, app.db.sync_engine, app.redis_client.sync_redis,
              app.redis_client.rq_redis):  # fmt: skip
        f.cache_clear()
    conn = redis.Redis.from_url(redis_url)
    conn.flushdb()
    yield conn
    conn.flushdb()
    for f in (get_settings, app.db.sync_engine, app.redis_client.sync_redis,
              app.redis_client.rq_redis):  # fmt: skip
        f.cache_clear()


def body(engine, **overrides):
    with engine.connect() as c:
        sid = c.scalar(text("SELECT id FROM stations WHERE station_uid = 'demo-TRA-zhongli'"))
    b = {
        "area": "taoyuan", "origin_station_id": sid, "date": DAY.isoformat(),
        "earliest_departure": "17:00", "latest_home": "23:00", "order": "movie_first",
        "budget_per_person": 1500, "max_walk_minutes": 12,
    }  # fmt: skip
    b.update(overrides)
    return b


class NoForkWorker(SimpleWorker):
    # RQ 預設會 fork，Windows 不支援；測試用不 fork 的 SimpleWorker 和計時器版的逾時
    death_penalty_class = TimerDeathPenalty


def run_worker(conn):
    NoForkWorker(["plans"], connection=conn).work(burst=True)


def collect(pubsub):
    events = []
    while (msg := pubsub.get_message(timeout=1)) is not None or not events:
        if msg and msg["type"] == "message":
            events.append(json.loads(msg["data"]))
        if events and events[-1]["event"] in ("result", "error"):
            break
    return events


def test_job_publishes_progress_then_result(env, engine):
    job_id = uuid.uuid4().hex
    pubsub = env.pubsub()
    pubsub.subscribe(channel(job_id))  # 先訂閱再排進佇列（5.7）
    pubsub.get_message(timeout=1)
    enqueue_plan(env, job_id, body(engine), get_settings())
    run_worker(env)

    events = collect(pubsub)
    names = [e["event"] for e in events]
    assert names[-1] == "result"
    assert set(names[:-1]) == {"progress"}
    stages = [e["data"]["stage"] for e in events if e["event"] == "progress"]
    assert stages[0] == "loading_data" and stages[-1] == "building_result"
    result = events[-1]["data"]
    assert result["job_id"] == job_id
    assert result["plans"][0]["highlight"]["key"] == "recommended"
    # 結果不寫進 Redis 的任何 key（5.7）
    assert not [k for k in env.keys("*") if job_id.encode() in k and not k.startswith(b"rq:")]


def test_job_publishes_error(env, engine):
    job_id = uuid.uuid4().hex
    pubsub = env.pubsub()
    pubsub.subscribe(channel(job_id))
    pubsub.get_message(timeout=1)
    enqueue_plan(env, job_id, body(engine, budget_per_person=100), get_settings())
    run_worker(env)

    events = collect(pubsub)
    assert events[-1]["event"] == "error"
    assert events[-1]["data"]["code"] == "NO_FEASIBLE"
    assert events[-1]["data"]["reasons"]["budget"] > 0


def test_queue_limit_and_positions(env, engine):
    s = get_settings()
    ids = [uuid.uuid4().hex for _ in range(5)]
    for job_id in ids:
        enqueue_plan(env, job_id, body(engine), s)
    assert [queue_position(env, j) for j in ids] == [1, 2, 3, 4, 5]
    with pytest.raises(QueueFull):
        enqueue_plan(env, uuid.uuid4().hex, body(engine), s)

    job = plans_queue(env).fetch_job(ids[0])
    assert job.timeout == s.plan_timeout_seconds
    assert job.ttl == s.plan_queue_ttl_seconds


def test_cancel_queued_job(env, engine):
    s = get_settings()
    ids = [uuid.uuid4().hex for _ in range(3)]
    for job_id in ids:
        enqueue_plan(env, job_id, body(engine), s)
    cancel_plan(env, ids[1])
    assert job_status(env, ids[1]) is None
    assert queue_position(env, ids[2]) == 2
    assert plans_queue(env).count == 2
    # 取消不存在的工作不會出錯
    cancel_plan(env, "no-such-job")
