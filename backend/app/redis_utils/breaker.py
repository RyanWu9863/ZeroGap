"""LLM 熔斷狀態放 Redis，讓所有 worker、所有規劃共用（LlmPicker 的 `breaker_store`）。

- `llm:breaker:v1:{base_url}:failures`：連續連不上的次數；過期時間是冷卻的 2 倍，
  很久沒有規劃時狀態自然清掉
- `llm:breaker:v1:{base_url}:open`：熔斷中，過期時間就是冷卻時間；還在就直接採用 Jev 最高的選項
- `llm:breaker:v1:{base_url}:probe`：冷卻結束後的試探租約，搶到的那一個去呼叫，其他的照樣當作熔斷。
  值是**這一次試探**的代號，過期時間比一次呼叫的逾時長一點，試探的程序掛掉也會自己解開

用 TTL 判斷到期，不存時間戳：各個 worker 的 `time.monotonic()` 不能互相比較。

每一個狀態轉換都是一筆 WATCH／MULTI 交易：讀完狀態、寫入之前如果有別的 worker 改過，整筆重來
（最多 `RETRIES` 次）。所以「先數失敗次數、再開熔斷」這種兩步驟中間不會被插隊。
同一個 store 只給一個 LlmPicker 依序使用（planner 每次規劃一個），`state()` 發出的試探代號記在
`self.token`，接下來的 `record_success()`／`record_failure()` 用它判斷這次回報是不是自己的試探：

- 試探租約已經被別人接手（代號不同）：遲到的舊回報不動狀態，不會清掉新持有者的租約。
- 租約還是自己的：成功就清除狀態；失敗就一律重新熔斷（次數至少記成門檻），不看次數是不是中途過期。
- 租約已經過期、也沒有人接手：當作一般的回報（成功清除；失敗照次數算）。

Redis 出錯時當作沒有熔斷、照常呼叫 LLM，只記警告，不讓規劃失敗。交易一直被別人改動、重試用完時，
`state()` 保守地當作熔斷（這次直接用 Jev 第一名），寫入的那一次就放棄，只記警告。
"""

import logging
import uuid
from typing import Literal

import redis

log = logging.getLogger(__name__)

VERSION = "v1"
RETRIES = 5
BreakerState = Literal["closed", "open", "probe"]


class RedisBreakerStore:
    def __init__(self, client: redis.Redis, name: str, version: str = VERSION):
        self.client = client
        prefix = f"llm:breaker:{version}:{name}"
        self.failures_key = f"{prefix}:failures"
        self.open_key = f"{prefix}:open"
        self.probe_key = f"{prefix}:probe"
        self.token: str | None = None  # 這個 store 目前持有的試探代號；沒有在試探就是 None

    @staticmethod
    def _same(holder: object, token: str) -> bool:
        return holder in (token, token.encode())

    def state(self, threshold: int, probe_ttl: float) -> BreakerState:
        """closed：照常呼叫；open：不要呼叫；probe：冷卻剛結束，這次由我去試。"""
        self.token = None
        try:
            with self.client.pipeline() as pipe:
                for _ in range(RETRIES):
                    try:
                        pipe.watch(self.open_key, self.probe_key, self.failures_key)
                        # 熔斷中，或別人正在試（失敗次數中途過期也一樣不放行）
                        if pipe.exists(self.open_key) or pipe.exists(self.probe_key):
                            return "open"
                        if int(pipe.get(self.failures_key) or 0) < threshold:
                            return "closed"
                        # 連續失敗次數夠了、熔斷已經到期：只放一個請求去試
                        token = uuid.uuid4().hex
                        pipe.multi()
                        pipe.set(self.probe_key, token, ex=max(1, round(probe_ttl)))
                        pipe.execute()
                        self.token = token
                        return "probe"
                    except redis.WatchError:
                        continue
            log.warning("LLM 熔斷狀態一直被其他 worker 改動，這次先當作熔斷")
            return "open"
        except (redis.RedisError, ValueError) as exc:
            log.warning("讀 LLM 熔斷狀態失敗，當作沒有熔斷：%r", exc)
            return "closed"

    def record_success(self) -> None:
        token, self.token = self.token, None
        try:
            with self.client.pipeline() as pipe:
                for _ in range(RETRIES):
                    try:
                        pipe.watch(self.probe_key)
                        holder = pipe.get(self.probe_key)
                        if token and holder is not None and not self._same(holder, token):
                            return  # 我的租約已經被別人接手：遲到的成功不清掉新持有者的狀態
                        pipe.multi()
                        pipe.delete(self.failures_key, self.open_key, self.probe_key)
                        pipe.execute()
                        return
                    except redis.WatchError:
                        continue
            log.warning("清除 LLM 熔斷狀態時一直被其他 worker 改動，這次放棄")
        except redis.RedisError as exc:
            log.warning("清除 LLM 熔斷狀態失敗：%r", exc)

    def record_failure(self, threshold: int, cooldown: float) -> int:
        """回傳目前連續失敗的次數；Redis 出錯或放棄時回傳 0（不熔斷）。"""
        token, self.token = self.token, None
        keep = max(1, round(cooldown * 2))
        try:
            with self.client.pipeline() as pipe:
                for _ in range(RETRIES):
                    try:
                        pipe.watch(self.failures_key, self.probe_key)
                        holder = pipe.get(self.probe_key)
                        current = int(pipe.get(self.failures_key) or 0)
                        if token and holder is not None and not self._same(holder, token):
                            return current  # 我的租約已經被別人接手：遲到的失敗不動狀態
                        mine = bool(token) and holder is not None  # 租約還在，而且是我的
                        count = current + 1
                        if mine and count < threshold:
                            count = threshold  # 自己的試探失敗：一律重新熔斷
                        pipe.multi()
                        pipe.set(self.failures_key, count, ex=keep)
                        if count >= threshold:
                            pipe.set(self.open_key, "1", ex=max(1, round(cooldown)))
                            if mine:
                                pipe.delete(self.probe_key)
                        pipe.execute()
                        return count
                    except redis.WatchError:
                        continue
            log.warning("寫 LLM 熔斷狀態時一直被其他 worker 改動，這次放棄")
            return 0
        except (redis.RedisError, ValueError) as exc:
            log.warning("寫 LLM 熔斷狀態失敗：%r", exc)
            return 0
