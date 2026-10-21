"""每月額度（規格書 5.5）：照日曆月計數，`quota:{對象}:{YYYY-MM}`，下個月 5 日過期。

呼叫外部服務前先用 `has_room` 檢查，成功後再 `add_usage`。月份照台灣時間。
"""

import math
from datetime import datetime
from zoneinfo import ZoneInfo

import redis
import redis.asyncio as aioredis

TZ = ZoneInfo("Asia/Taipei")
JEV_USD_PER_MILLION_TOKENS = 0.042


def _local(now: datetime | None) -> datetime:
    return (now or datetime.now(TZ)).astimezone(TZ)


def quota_key(name: str, now: datetime | None = None) -> str:
    return f"quota:{name}:{_local(now):%Y-%m}"


def quota_expire_at(now: datetime | None = None) -> datetime:
    """下個月 5 日 00:00（台灣時間）。多留幾天，月初還查得到上個月用了多少。"""
    local = _local(now)
    year, month = (local.year + 1, 1) if local.month == 12 else (local.year, local.month + 1)
    return datetime(year, month, 5, tzinfo=TZ)


def jev_cost_micro_usd(input_tokens: int) -> int:
    """Jev 只算輸入 token，存成百萬分之一美元的整數，無條件進位。"""
    return math.ceil(input_tokens * JEV_USD_PER_MILLION_TOKENS)


def used(client: redis.Redis, name: str, now: datetime | None = None) -> int:
    return int(client.get(quota_key(name, now)) or 0)


async def aused(client: aioredis.Redis, name: str, now: datetime | None = None) -> int:
    return int(await client.get(quota_key(name, now)) or 0)


def has_room(
    client: redis.Redis, name: str, limit: int, amount: int = 1, now: datetime | None = None
) -> bool:
    return used(client, name, now) + amount <= limit


def add_usage(client: redis.Redis, name: str, amount: int, now: datetime | None = None) -> int:
    key = quota_key(name, now)
    pipe = client.pipeline()
    pipe.incrby(key, amount)
    pipe.expireat(key, int(quota_expire_at(now).timestamp()))
    total, _ = pipe.execute()
    return int(total)
