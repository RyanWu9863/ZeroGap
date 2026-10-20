"""`POST /api/plans` 的 SSE 串流（規格書 5.7、6.4）。

1. 先訂閱 `plan:{job_id}:events`，再把工作排進佇列
2. 推送 `queued`（順位改變時再推一次）、轉送 worker 的 `progress`
3. 收到 `result` 或 `error` 就結束串流
4. 每 15 秒送一行註解當心跳
5. 使用者斷線就取消工作：排隊中的移除，執行中的停下來；並釋放這個 IP 的「規劃中」標記
"""

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import anyio
import redis.asyncio as aioredis
from rq.job import JobStatus
from starlette.requests import Request

from app.config import Settings
from app.jobs.plan_job import channel
from app.jobs.queue import QueueFull, cancel_plan, enqueue_plan, job_status, queue_position
from app.redis_client import rq_redis
from app.services import sse

POLL_SECONDS = 2.0


def active_key(ip: str) -> str:
    return f"active:plan:{ip}"


async def release_active(r: aioredis.Redis, ip: str, job_id: str) -> None:
    """只刪自己的標記：值是 job_id 才刪。"""
    key = active_key(ip)
    if await r.get(key) == job_id:
        await r.delete(key)


async def plan_events(
    request: Request,
    r: aioredis.Redis,
    s: Settings,
    job_id: str,
    body: dict[str, Any],
    ip: str,
) -> AsyncIterator[str]:
    rq_conn = rq_redis()
    pubsub = r.pubsub()
    finished = False
    try:
        await pubsub.subscribe(channel(job_id))
        try:
            await asyncio.to_thread(enqueue_plan, rq_conn, job_id, body, s)
        except QueueFull:
            # 送出前檢查過一次；幾個請求同時進來時還是可能在這裡滿
            finished = True
            yield sse("error", {"code": "QUEUE_FULL", "message": "排隊的人太多了，請一分鐘後再試"})
            return

        position = await asyncio.to_thread(queue_position, rq_conn, job_id)
        last_position = position or 1
        yield sse("queued", {"job_id": job_id, "position": last_position})

        loop = asyncio.get_running_loop()
        last_sent = last_poll = loop.time()
        deadline = last_sent + s.plan_queue_ttl_seconds + s.plan_timeout_seconds + 60
        started = False
        missing = 0  # 連續幾次查不到工作

        while True:
            if await request.is_disconnected():
                return
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            now = loop.time()
            if msg is not None:
                event = json.loads(msg["data"])
                yield sse(event["event"], event["data"])
                last_sent, missing = now, 0
                if event["event"] == "progress":
                    started = True
                if event["event"] in ("result", "error"):
                    finished = True
                    return
                continue

            if now - last_poll >= POLL_SECONDS:
                last_poll = now
                if not started:
                    position = await asyncio.to_thread(queue_position, rq_conn, job_id)
                    if position is not None and position != last_position:
                        last_position = position
                        yield sse("queued", {"job_id": job_id, "position": position})
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
                        yield sse("error", {"code": "TIMEOUT", "message": "排隊太久，請再試一次"})
                    else:
                        yield sse(
                            "error", {"code": "INTERNAL_ERROR", "message": "規劃中斷，請再試一次"}
                        )
                    return

            if now > deadline:
                finished = True
                yield sse("error", {"code": "TIMEOUT", "message": "規劃超過時間上限，請再試一次"})
                return
            if now - last_sent >= s.sse_heartbeat_seconds:
                yield ": ping\n\n"
                last_sent = now
    finally:
        # 斷線時這裡可能在已取消的狀態下執行，要擋住取消才做得完清理
        with anyio.CancelScope(shield=True):
            if not finished:
                await asyncio.to_thread(cancel_plan, rq_conn, job_id)
            await pubsub.unsubscribe()
            await pubsub.aclose()
            await release_active(r, ip, job_id)
