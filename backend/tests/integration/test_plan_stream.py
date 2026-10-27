"""plan_events 收尾：拿到結果就離開時，不能把剛跑完的工作停掉（bug 清單 L2）。"""

import pytest
import redis
import redis.asyncio as aioredis

from app import plan_stream
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
