"""滑動窗口限流（規格書 5.5）。

一個 Lua script 原子地完成：移除窗口外的紀錄 → 計數 → 沒超過就記一筆 → 設定過期時間。
被擋下的那次不記錄。時間由呼叫端傳入（毫秒），測試可以自己控制時鐘。
"""

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass

import redis
import redis.asyncio as aioredis

SLIDING_WINDOW = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
if redis.call('ZCARD', key) < limit then
  redis.call('ZADD', key, now, ARGV[4])
  redis.call('PEXPIRE', key, window)
  return {1, 0}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
if #oldest == 0 then
  return {0, window}  -- 上限是 0：完全不允許
end
return {0, window - (now - tonumber(oldest[2]))}
"""


@dataclass(frozen=True)
class RateResult:
    allowed: bool
    retry_after_ms: int  # 被擋下時，要等多久才會有空位

    @property
    def retry_after_seconds(self) -> int:
        """給 HTTP 的 Retry-After 用，無條件進位。"""
        return -(-self.retry_after_ms // 1000)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _args(window_ms: int, limit: int, now_ms: int | None) -> list:
    now = _now_ms() if now_ms is None else now_ms
    return [now, window_ms, limit, f"{now}-{uuid.uuid4().hex}"]


def hit(
    client: redis.Redis, key: str, limit: int, window_ms: int, now_ms: int | None = None
) -> RateResult:
    allowed, retry = client.eval(SLIDING_WINDOW, 1, key, *_args(window_ms, limit, now_ms))
    return RateResult(bool(allowed), int(retry))


async def ahit(
    client: aioredis.Redis, key: str, limit: int, window_ms: int, now_ms: int | None = None
) -> RateResult:
    allowed, retry = await client.eval(SLIDING_WINDOW, 1, key, *_args(window_ms, limit, now_ms))
    return RateResult(bool(allowed), int(retry))


def wait_for_slot(
    client: redis.Redis,
    key: str,
    limit: int,
    window_ms: int,
    on_wait: Callable[[int], None] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    clock_ms: Callable[[], int] = _now_ms,
) -> None:
    """等到窗口有空位再回來（TDX、Jev 用：超過上限時排隊等候，不是直接失敗）。

    每次要等的時候呼叫 `on_wait(毫秒)`，規劃中會推送 `waiting_quota` 的進度事件。
    """
    while True:
        result = hit(client, key, limit, window_ms, now_ms=clock_ms())
        if result.allowed:
            return
        if on_wait:
            on_wait(result.retry_after_ms)
        sleep(max(result.retry_after_ms, 50) / 1000)
