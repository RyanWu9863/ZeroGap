"""分享連結（取餐號碼牌，規格書 6.8）：排出來的結果存起來，用 job_id 拿回同一份。

`plan_stream.plan_events` 交出 result 前呼叫 `save_plan`；`GET /api/plans/{job_id}` 用 `load_plan`；
MCP 的 `plan_date` 用 `share_url` 組出網頁連結。存不進去不影響規劃，只是沒有連結。
"""

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any

import redis
import redis.asyncio as aioredis

from app.config import Settings

log = logging.getLogger(__name__)

JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")


def saved_key(job_id: str) -> str:
    return f"plan:{job_id}:saved"


async def save_plan(
    r: aioredis.Redis,
    s: Settings,
    job_id: str,
    request: dict[str, Any],
    result: dict[str, Any],
    now: datetime,
) -> bool:
    """存成功回 True；Redis 出錯（例如記憶體滿了）只記 warning、回 False，不丟例外。"""
    ttl = s.saved_plan_ttl_seconds
    doc = {
        "job_id": job_id,
        "request": request,
        "result": result,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(seconds=ttl)).isoformat(),
    }
    try:
        mem = await r.info("memory")
        maxmemory = int(mem.get("maxmemory", 0))
        if (
            maxmemory > 0
            and int(mem.get("used_memory", 0)) > s.saved_plan_max_memory_ratio * maxmemory
        ):
            log.warning("Redis 記憶體已用超過七成，這次不存分享用的行程（job_id=%s）", job_id)
            return False
        await r.set(saved_key(job_id), json.dumps(doc, ensure_ascii=False), ex=ttl)
    except redis.RedisError:
        log.warning("分享用的行程存不進 Redis（job_id=%s），這次不附連結", job_id, exc_info=True)
        return False
    return True


async def load_plan(r: aioredis.Redis, job_id: str) -> dict[str, Any] | None:
    raw = await r.get(saved_key(job_id))
    return json.loads(raw) if raw else None


def share_url(s: Settings, job_id: str) -> str | None:
    base = s.public_web_base_url.rstrip("/")
    return f"{base}/p/{job_id}" if base else None


def not_found_message(s: Settings) -> str:
    return f"找不到這份行程，可能已經超過 {s.saved_plan_ttl_seconds // 86400} 天"
