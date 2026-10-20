"""分散式鎖（規格書 5.4）：`SET lock:{name} {隨機值} NX PX`，比對值相同才延長或釋放。"""

import uuid

import redis

DEFAULT_TTL_MS = 600_000  # 10 分鐘

_EXTEND = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
"""

_RELEASE = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""


def _key(name: str) -> str:
    return f"lock:{name}"


def acquire(client: redis.Redis, name: str, ttl_ms: int = DEFAULT_TTL_MS) -> str | None:
    """搶到就回傳 token，沒搶到回傳 None（排程工作沒搶到就直接跳過）。"""
    token = uuid.uuid4().hex
    return token if client.set(_key(name), token, nx=True, px=ttl_ms) else None


def extend(client: redis.Redis, name: str, token: str, ttl_ms: int = DEFAULT_TTL_MS) -> bool:
    """工作還在跑時延長；只有持有者能延長。"""
    return bool(client.eval(_EXTEND, 1, _key(name), token, ttl_ms))


def release(client: redis.Redis, name: str, token: str) -> bool:
    """只有持有者能釋放，避免鎖過期後刪到別人的鎖。"""
    return bool(client.eval(_RELEASE, 1, _key(name), token))


class Lock:
    """`with Lock(r, "job:refresh_daily") as lock: if lock.acquired: ...`"""

    def __init__(self, client: redis.Redis, name: str, ttl_ms: int = DEFAULT_TTL_MS):
        self.client, self.name, self.ttl_ms = client, name, ttl_ms
        self.token: str | None = None

    @property
    def acquired(self) -> bool:
        return self.token is not None

    def extend(self) -> bool:
        return self.acquired and extend(self.client, self.name, self.token, self.ttl_ms)

    def __enter__(self) -> "Lock":
        self.token = acquire(self.client, self.name, self.ttl_ms)
        return self

    def __exit__(self, *exc) -> None:
        if self.token:
            release(self.client, self.name, self.token)
            self.token = None
