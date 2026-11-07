"""LLM 熔斷狀態放 Redis，讓所有 worker、所有規劃共用（LlmPicker 的 `breaker_store`）。

- `llm:breaker:v1:{base_url}:failures`：連續連不上的次數，INCR；過期時間是冷卻的 2 倍，
  很久沒有規劃時狀態自然清掉
- `llm:breaker:v1:{base_url}:open`：熔斷中，過期時間就是冷卻時間；還在就直接採用 Jev 最高的選項
- `llm:breaker:v1:{base_url}:probe`：冷卻結束後的試探鎖，`SET NX EX`；搶到的那一個去呼叫，
  其他的照樣當作熔斷。過期時間比一次呼叫的逾時長一點，試探的程序掛掉也會自己解開

用 TTL 判斷到期，不存時間戳：各個 worker 的 `time.monotonic()` 不能互相比較。
Redis 出錯時當作沒有熔斷、照常呼叫 LLM，只記警告，不讓規劃失敗。
"""

import logging
from typing import Literal

import redis

log = logging.getLogger(__name__)

VERSION = "v1"
BreakerState = Literal["closed", "open", "probe"]


class RedisBreakerStore:
    def __init__(self, client: redis.Redis, name: str, version: str = VERSION):
        self.client = client
        prefix = f"llm:breaker:{version}:{name}"
        self.failures_key = f"{prefix}:failures"
        self.open_key = f"{prefix}:open"
        self.probe_key = f"{prefix}:probe"

    def state(self, threshold: int, probe_ttl: float) -> BreakerState:
        """closed：照常呼叫；open：不要呼叫；probe：冷卻剛結束，這次由我去試。"""
        try:
            if self.client.exists(self.open_key):
                return "open"
            if int(self.client.get(self.failures_key) or 0) < threshold:
                return "closed"
            # 連續失敗次數夠了、熔斷已經到期：只放一個請求去試
            got = self.client.set(self.probe_key, "1", nx=True, ex=max(1, round(probe_ttl)))
            return "probe" if got else "open"
        except (redis.RedisError, ValueError) as exc:
            log.warning("讀 LLM 熔斷狀態失敗，當作沒有熔斷：%r", exc)
            return "closed"

    def record_success(self) -> None:
        try:
            self.client.delete(self.failures_key, self.open_key, self.probe_key)
        except redis.RedisError as exc:
            log.warning("清除 LLM 熔斷狀態失敗：%r", exc)

    def record_failure(self, threshold: int, cooldown: float) -> int:
        """回傳目前連續失敗的次數；Redis 出錯時回傳 0（不熔斷）。"""
        try:
            pipe = self.client.pipeline()
            pipe.incr(self.failures_key)
            pipe.expire(self.failures_key, max(1, round(cooldown * 2)))
            count, _ = pipe.execute()
            count = int(count)
            if count >= threshold:
                pipe = self.client.pipeline()
                pipe.set(self.open_key, "1", ex=max(1, round(cooldown)))
                pipe.delete(self.probe_key)
                pipe.execute()
            return count
        except (redis.RedisError, ValueError) as exc:
            log.warning("寫 LLM 熔斷狀態失敗：%r", exc)
            return 0
