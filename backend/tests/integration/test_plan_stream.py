"""plan_events 收尾：拿到結果就離開時，不能把剛跑完的工作停掉（bug 清單 L2）。"""

import pytest
import redis
import redis.asyncio as aioredis

from app import plan_stream, saved_plans
from app.config import get_settings
from app.jobs.plan_job import channel, encode


@pytest.fixture
def fake_queue(monkeypatch, redis_url):
    """不排真的工作：一排進去就像 worker 一樣送出最後的事件，記下有沒有被取消。"""
    sync = redis.Redis.from_url(redis_url)
    cancelled: list[str] = []
    final: dict[str, tuple[str, dict]] = {}

    def enqueue(_conn, job_id, _body, _s):
        sync.publish(channel(job_id), encode(*final["event"]))

    monkeypatch.setattr(plan_stream, "rq_redis", lambda: sync)
    monkeypatch.setattr(plan_stream, "enqueue_plan", enqueue)
    monkeypatch.setattr(plan_stream, "queue_position", lambda _c, _j: 1)
    monkeypatch.setattr(plan_stream, "cancel_plan", lambda _c, job_id: cancelled.append(job_id))
    yield final, cancelled
    sync.close()


@pytest.mark.parametrize(
    "event",
    [("result", {"plans": []}), ("error", {"code": "NO_FEASIBLE", "message": "排不出來"})],
)
async def test_leaving_right_after_final_event_does_not_cancel(fake_queue, redis_url, event):
    final, cancelled = fake_queue
    final["event"] = event
    r = aioredis.from_url(redis_url, decode_responses=True)
    await r.set(plan_stream.active_key("1.2.3.4"), "job-l2")
    events = plan_stream.plan_events(r, get_settings(), "job-l2", {}, "1.2.3.4")
    # 跟 MCP 的 plan_date 一樣：拿到最後的事件就 return，generator 停在 yield
    async for name, _data in events:
        if name == event[0]:
            break
    await events.aclose()
    assert cancelled == []
    assert await r.get(plan_stream.active_key("1.2.3.4")) is None
    await r.aclose()


async def _run_until(events, name):
    async for got, data in events:
        if got == name:
            return data
    return None


async def test_result_is_saved_before_it_is_handed_out(fake_queue, redis_url):
    final, _cancelled = fake_queue
    job = "a" * 32
    final["event"] = ("result", {"job_id": job, "plans": []})
    r = aioredis.from_url(redis_url, decode_responses=True)
    s = get_settings()
    saved: list[bool] = []
    events = plan_stream.plan_events(
        r, s, job, {"area": "taoyuan"}, "1.2.3.5", on_saved=saved.append
    )
    async for name, _data in events:
        if name == "result":
            # 交出 result 的這一刻就要讀得到（MCP 拿到結果馬上回傳連結）
            doc = await saved_plans.load_plan(r, job)
            break
    await events.aclose()
    assert saved == [True]
    assert doc["result"] == {"job_id": job, "plans": []}
    assert doc["request"] == {"area": "taoyuan"}
    ttl = await r.ttl(saved_plans.saved_key(job))
    assert s.saved_plan_ttl_seconds - 60 < ttl <= s.saved_plan_ttl_seconds
    await r.delete(saved_plans.saved_key(job))
    await r.aclose()


async def test_error_is_not_saved(fake_queue, redis_url):
    final, _cancelled = fake_queue
    job = "b" * 32
    final["event"] = ("error", {"code": "NO_FEASIBLE", "message": "排不出來"})
    r = aioredis.from_url(redis_url, decode_responses=True)
    saved: list[bool] = []
    events = plan_stream.plan_events(r, get_settings(), job, {}, "1.2.3.6", on_saved=saved.append)
    assert await _run_until(events, "error") is not None
    await events.aclose()
    assert saved == []
    assert await r.exists(saved_plans.saved_key(job)) == 0
    await r.aclose()


async def test_result_still_handed_out_when_saving_fails(fake_queue, redis_url, monkeypatch):
    final, _cancelled = fake_queue
    job = "c" * 32
    final["event"] = ("result", {"job_id": job, "plans": []})

    async def broken_save(*_args, **_kwargs):
        return False

    monkeypatch.setattr(plan_stream, "save_plan", broken_save)
    r = aioredis.from_url(redis_url, decode_responses=True)
    saved: list[bool] = []
    events = plan_stream.plan_events(r, get_settings(), job, {}, "1.2.3.7", on_saved=saved.append)
    assert await _run_until(events, "result") == {"job_id": job, "plans": []}
    await events.aclose()
    assert saved == [False]
    await r.aclose()
