"""Redis 連線。

- 一般用途：decode_responses=True，回傳字串
- RQ：不能 decode，因為 RQ 存的是二進位資料
- 都設定連線和讀寫逾時：Redis 掛掉時要快點失敗，不能每次卡好幾秒
"""

from functools import lru_cache

import redis
import redis.asyncio as aioredis

from app.config import get_settings

_TIMEOUTS = {"socket_connect_timeout": 2, "socket_timeout": 5}


@lru_cache
def sync_redis() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url, decode_responses=True, **_TIMEOUTS)


@lru_cache
def rq_redis() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url, **_TIMEOUTS)


@lru_cache
def async_redis() -> aioredis.Redis:
    # Pub/Sub 要一直等訊息，不能設讀取逾時
    return aioredis.Redis.from_url(
        get_settings().redis_url, decode_responses=True, socket_connect_timeout=2
    )
