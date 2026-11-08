"""送出規劃、轉送進度（規格書 5.7、6.4、6.6）。`POST /api/plans`（SSE）和 MCP 的 `plan_date` 共用。

1. `reserve_plan`：每個 IP 同時 1 個、排隊上限、每小時次數；擋下時丟 ApiError，不開始串流
2. `plan_events`：先訂閱 `plan:{job_id}:events`，再把工作排進佇列；產生 (事件, 資料)：
   `queued`（順位改變時再送一次）、worker 的 `progress`、最後的 `result` 或 `error`；
   一陣子沒有事件時產生 `ping`（SSE 轉成心跳註解，MCP 忽略）
   收到 result 時先存一份（分享連結，規格書 6.8），再交出去；存不進去不影響規劃
3. 結束或中斷（使用者斷線、MCP 客戶端取消）時取消工作，並釋放這個 IP 的「規劃中」標記
"""

import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import aclosing
from datetime import datetime
from typing import Any

import anyio
import redis.asyncio as aioredis
from rq.job import JobStatus

from app import tracing
from app.config import Settings
from app.jobs.plan_job import channel
from app.jobs.queue import (
    QueueFull,
    cancel_plan,
    enqueue_plan,
    job_status,
    plans_queue,
    queue_position,
)
from app.redis_client import rq_redis
from app.redis_utils.ratelimit import ahit
from app.saved_plans import save_plan
from app.services import TZ, ApiError, sse

POLL_SECONDS = 2.0
Event = tuple[str, dict[str, Any]]


def active_key(ip: str) -> str:
    return f"active:plan:{ip}"


def rate_limited(retry_after_seconds: int) -> ApiError:
    return ApiError(
        429, "RATE_LIMITED", "請稍後再試", headers={"Retry-After": str(retry_after_seconds)}
    )


async def release_active(r: aioredis.Redis, ip: str, job_id: str) -> None:
    """只刪自己的標記：值是 job_id 才刪。"""
    key = active_key(ip)
    if await r.get(key) == job_id:
        await r.delete(key)


async def reserve_plan(r: aioredis.Redis, s: Settings, ip: str, job_id: str) -> None:
    """409 同時一個 → 503 佇列滿 → 429 每小時次數（5.5）。被擋下時清掉標記，不算次數。"""
    key = active_key(ip)
    # 25 分鐘涵蓋排隊 15 分鐘＋執行 10 分鐘
    ttl = s.plan_queue_ttl_seconds + s.plan_timeout_seconds
    if not await r.set(key, job_id, nx=True, ex=ttl):
        raise ApiError(409, "PLAN_IN_PROGRESS", "你已經有一個規劃在進行，請等它完成")
    try:
        waiting = await asyncio.to_thread(lambda: plans_queue(rq_redis()).count)
        if waiting >= s.plan_queue_max_waiting:
            raise ApiError(
                503, "QUEUE_FULL", "排隊的人太多了，請一分鐘後再試", headers={"Retry-After": "60"}
            )
        hourly = await ahit(r, f"rl:api:plan:{ip}", s.api_plan_per_hour, 3_600_000)
        if not hourly.allowed:
            raise rate_limited(hourly.retry_after_seconds)
    except BaseException:
        await r.delete(key)
        raise


async def _never() -> bool:
    return False


async def plan_events(
    r: aioredis.Redis,
    s: Settings,
    job_id: str,
    body: dict[str, Any],
    ip: str,
    disconnected: Callable[[], Awaitable[bool]] = _never,
    trace_parent: Any = None,
    on_saved: Callable[[bool], None] | None = None,
) -> AsyncIterator[Event]:
    """`trace_parent`：追蹤開啟時 `POST /api/plans` 那個 span 的 context（`tracing.capture()`），
    讓 `plan.stream` 接在它下面；MCP 不傳，`plan.stream` 自己是一條 trace 的開頭。"""
    sp, ctx = tracing.start_span("plan.stream", {"job_id": job_id}, parent=trace_parent)
    try:
        # 這裡被提早關掉（拿到結果就離開、出錯、取消）時，aclosing 會馬上關內層，讓它的 finally
        # 立刻收尾：取消還沒跑完的工作、釋放這個 IP 的「規劃中」標記。只用 async for 的話，內層
        # 要等被回收才收尾，同一個 IP 的下一個請求會收到 PLAN_IN_PROGRESS（和 mcp.py 用 aclosing
        # 的原因相同）
        async with aclosing(
            _plan_events(r, s, job_id, body, ip, disconnected, ctx, on_saved=on_saved)
        ) as inner:
            async for item in inner:
                if item[0] in ("result", "error"):
                    tracing.set_attrs(sp, {"plan.outcome": item[0]})
                yield item
    finally:
        tracing.end_span(sp)


async def _plan_events(
    r: aioredis.Redis,
    s: Settings,
    job_id: str,
    body: dict[str, Any],
    ip: str,
    disconnected: Callable[[], Awaitable[bool]],
    trace_ctx: Any = None,
    on_saved: Callable[[bool], None] | None = None,
) -> AsyncIterator[Event]:
    rq_conn = rq_redis()
    pubsub = r.pubsub()
    finished = False
    try:
        await pubsub.subscribe(channel(job_id))
        try:
            # to_thread 會帶著目前的 context，enqueue_plan 從 plan.enqueue 這個 span 取 traceparent
            with tracing.span("plan.enqueue", {"job_id": job_id}, parent=trace_ctx):
                await asyncio.to_thread(enqueue_plan, rq_conn, job_id, body, s)
        except QueueFull:
            # 送出前檢查過一次；幾個請求同時進來時還是可能在這裡滿
            finished = True
            yield "error", {"code": "QUEUE_FULL", "message": "排隊的人太多了，請一分鐘後再試"}
            return

        position = await asyncio.to_thread(queue_position, rq_conn, job_id)
        last_position = position or 1
        yield "queued", {"job_id": job_id, "position": last_position}

        loop = asyncio.get_running_loop()
        last_sent = last_poll = loop.time()
        deadline = last_sent + s.plan_queue_ttl_seconds + s.plan_timeout_seconds + 60
        started = False
        missing = 0  # 連續幾次查不到工作

        while True:
            if await disconnected():
                return
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            now = loop.time()
            if msg is not None:
                event = json.loads(msg["data"])
                # 送出前就要標記：MCP 拿到結果就離開，generator 停在 yield，
                # 收尾時才不會把剛跑完的工作停掉（2026-10-24 bug 清單 L2）
                finished = event["event"] in ("result", "error")
                if event["event"] == "result":
                    # 分享連結：交出結果前先存好，MCP 拿到結果就能馬上給連結（規格書 6.8）
                    ok = await save_plan(r, s, job_id, body, event["data"], datetime.now(TZ))
                    if on_saved is not None:
                        on_saved(ok)
                yield event["event"], event["data"]
                if finished:
                    return
                last_sent, missing = now, 0
                if event["event"] == "progress":
                    started = True
                continue

            if now - last_poll >= POLL_SECONDS:
                last_poll = now
                if not started:
                    position = await asyncio.to_thread(queue_position, rq_conn, job_id)
                    if position is not None and position != last_position:
                        last_position = position
                        yield "queued", {"job_id": job_id, "position": position}
                        last_sent = now
                status = await asyncio.to_thread(job_status, rq_conn, job_id)
                bad = status is None or status in (
                    JobStatus.FAILED,
                    JobStatus.STOPPED,
                    JobStatus.CANCELED,
                )
                # worker 推送結果後會馬上刪掉工作（result_ttl=0），所以要連續兩次查不到才算
                missing = missing + 1 if bad else 0
                if missing >= 2:
                    finished = True
                    if status is None and not started:
                        yield "error", {"code": "TIMEOUT", "message": "排隊太久，請再試一次"}
                    else:
                        yield "error", {"code": "INTERNAL_ERROR", "message": "規劃中斷，請再試一次"}
                    return

            if now > deadline:
                finished = True
                yield "error", {"code": "TIMEOUT", "message": "規劃超過時間上限，請再試一次"}
                return
            if now - last_sent >= s.sse_heartbeat_seconds:
                yield "ping", {}
                last_sent = now
    finally:
        # 斷線或取消時這裡可能在已取消的狀態下執行，要擋住取消才做得完清理
        with anyio.CancelScope(shield=True):
            if not finished:
                await asyncio.to_thread(cancel_plan, rq_conn, job_id)
            await pubsub.unsubscribe()
            await pubsub.aclose()
            await release_active(r, ip, job_id)


async def with_saved_flag(events: AsyncIterator[Event], saved: list[bool]) -> AsyncIterator[Event]:
    """網頁的 SSE：`result` 多帶 `saved`，說這份有沒有存起來（規格書 6.8，v0.23）。

    `saved` 是傳給 `plan_events(on_saved=saved.append)` 的同一個 list；`plan_events` 交出 result
    前已經存過，所以這時看得到結果。存不進去時，自己的瀏覽器還看得到 /p/{job_id}，傳出去的連結卻
    會 404，前端看到 false 就把分享停用。MCP 不經過這裡（它看 on_saved 決定附不附 share_url）。
    提早關掉時用 aclosing 馬上關內層，原因同 `plan_events`。
    """
    async with aclosing(events) as inner:
        async for name, data in inner:
            if name == "result":
                data = {**data, "saved": bool(saved and saved[-1])}
            yield name, data


async def sse_stream(events: AsyncIterator[Event]) -> AsyncIterator[str]:
    """轉成 SSE；`ping` 變成心跳註解，避免中間的代理切斷連線（6.4）。"""
    async for name, data in events:
        yield ": ping\n\n" if name == "ping" else sse(name, data)
