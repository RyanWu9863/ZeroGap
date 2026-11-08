"""plan_events 被提早關掉時，內層 _plan_events 要馬上收尾：它的 finally 會取消還沒跑完的工作、
釋放這個 IP 的「規劃中」標記。不能等 generator 被回收才收尾，不然同一個 IP 的下一個請求會收到
409 PLAN_IN_PROGRESS（和 mcp.py 用 aclosing 是同一個問題）。

前面幾個把 _plan_events 換成假的，finally 先 await 一次再記下已收尾，和真的收尾一樣要等；
最後一個用真的 _plan_events，Redis、RQ 換成假的。追蹤開、關都測，都不連任何服務。
"""

import asyncio

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app import plan_stream, tracing
from app.config import Settings

JOB = "job-close"
EVENTS = [
    ("queued", {"job_id": JOB, "position": 1}),
    ("progress", {"stage": "loading_data"}),
    ("result", {"plans": []}),
]


@pytest.fixture(params=["tracing_on", "tracing_off"])
def exporter(request):
    """追蹤開：回傳接在 provider 上的 InMemorySpanExporter；追蹤關：回傳 None。"""
    exp = None
    if request.param == "tracing_on":
        exp = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exp))
        tracing.set_provider(provider)
    yield exp
    tracing.set_provider(None)


@pytest.fixture
def closed(monkeypatch):
    """內層換成依序送出 EVENTS 的假 generator；回傳的 list 在它收尾時加入 job_id。"""
    done: list[str] = []

    async def fake_plan_events(r, s, job_id, body, ip, disconnected, trace_ctx=None):
        try:
            for item in EVENTS:
                yield item
        finally:
            await asyncio.sleep(0)
            done.append(job_id)

    monkeypatch.setattr(plan_stream, "_plan_events", fake_plan_events)
    return done


def open_stream():
    return plan_stream.plan_events(None, None, JOB, {}, "1.2.3.4")


def assert_stream_span_ended(exporter):
    if exporter is not None:
        assert [sp.name for sp in exporter.get_finished_spans()] == ["plan.stream"]


async def test_aclose_after_first_event_closes_inner_now(exporter, closed):
    events = open_stream()
    assert await anext(events) == EVENTS[0]
    await events.aclose()
    assert closed == [JOB]  # aclose() 回來時內層已經收尾
    assert_stream_span_ended(exporter)


async def test_error_thrown_into_stream_closes_inner_now(exporter, closed):
    events = open_stream()
    await anext(events)
    with pytest.raises(RuntimeError, match="consumer failed"):
        await events.athrow(RuntimeError("consumer failed"))
    assert closed == [JOB]
    assert_stream_span_ended(exporter)


async def test_cancelled_consumer_closes_inner_on_aclose(exporter, closed):
    """像 MCP 的 plan_date：在迴圈裡等別的事（回報進度）時被取消，離開時 aclose。"""
    got_first = asyncio.Event()
    seen_after_aclose: list[list[str]] = []

    async def consume():
        events = open_stream()
        try:
            async for _ in events:
                got_first.set()
                await asyncio.Event().wait()  # 在這裡被取消
        finally:
            await events.aclose()
            seen_after_aclose.append(list(closed))

    task = asyncio.create_task(consume())
    await got_first.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert seen_after_aclose == [[JOB]]
    assert_stream_span_ended(exporter)


async def test_cancel_while_waiting_inside_stream_closes_inner(exporter, monkeypatch):
    """在內層等 Redis 時被取消（例如 SSE 斷線）：取消從內層丟出來，內層照樣收尾。"""
    done: list[str] = []
    waiting = asyncio.Event()

    async def fake_plan_events(r, s, job_id, body, ip, disconnected, trace_ctx=None):
        try:
            yield EVENTS[0]
            waiting.set()
            await asyncio.Event().wait()  # 像在等 pubsub.get_message
            yield EVENTS[1]
        finally:
            await asyncio.sleep(0)
            done.append(job_id)

    monkeypatch.setattr(plan_stream, "_plan_events", fake_plan_events)

    async def consume():
        async for _ in open_stream():
            pass

    task = asyncio.create_task(consume())
    await waiting.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert done == [JOB]
    assert_stream_span_ended(exporter)


async def test_full_stream_is_unchanged(exporter, closed):
    assert [item async for item in open_stream()] == EVENTS
    assert closed == [JOB]
    if exporter is not None:
        [sp] = exporter.get_finished_spans()
        assert sp.name == "plan.stream"
        assert sp.attributes["plan.outcome"] == "result"


# ── 真的 _plan_events：Redis、RQ 換成假的 ───────────────────────────


class FakePubSub:
    closed = False

    async def subscribe(self, *channels):
        pass

    async def unsubscribe(self, *channels):
        pass

    async def aclose(self):
        self.closed = True


class FakeRedis:
    def __init__(self):
        self.data: dict[str, str] = {}
        self.ps = FakePubSub()

    def pubsub(self):
        return self.ps

    async def get(self, key):
        return self.data.get(key)

    async def delete(self, key):
        self.data.pop(key, None)


async def test_real_inner_releases_ip_lock_on_aclose(exporter, monkeypatch):
    """aclose() 回來時，還沒跑完的工作已經取消，這個 IP 的「規劃中」標記已經刪掉。"""
    cancelled: list[str] = []
    monkeypatch.setattr(plan_stream, "rq_redis", lambda: None)
    monkeypatch.setattr(plan_stream, "enqueue_plan", lambda conn, job_id, body, s: None)
    monkeypatch.setattr(plan_stream, "queue_position", lambda conn, job_id: 1)
    monkeypatch.setattr(plan_stream, "cancel_plan", lambda conn, job_id: cancelled.append(job_id))
    r = FakeRedis()
    r.data[plan_stream.active_key("1.2.3.4")] = JOB

    events = plan_stream.plan_events(r, Settings(_env_file=None), JOB, {}, "1.2.3.4")
    assert await anext(events) == ("queued", {"job_id": JOB, "position": 1})
    await events.aclose()
    assert cancelled == [JOB]
    assert plan_stream.active_key("1.2.3.4") not in r.data  # 同一個 IP 馬上可以再送
    assert r.ps.closed
    if exporter is not None:
        names = {sp.name for sp in exporter.get_finished_spans()}
        assert names == {"plan.enqueue", "plan.stream"}
