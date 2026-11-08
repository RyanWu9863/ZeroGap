"""熔斷狀態放 Redis（app.redis_utils.breaker）：所有 worker、所有規劃共用。

專案沒有用 fakeredis，這裡用一個只實作會用到的指令的假 Redis，過期時間照假時鐘算。
"""

import json

import httpx
import pytest
import redis
import respx

from app.clients import make_llm
from app.config import Settings
from app.llm import LlmPicker
from app.planning.choose import ChoiceQuestion, Option
from app.redis_utils.breaker import RedisBreakerStore

BASE = "http://ollama.test:11434"
URL = f"{BASE}/api/generate"
QUESTION = ChoiceQuestion(
    id="restaurant",
    instructions="選一家最適合的餐廳",
    options=[Option("r1", "餐廳 1", {}), Option("r2", "餐廳 2", {}), Option("r3", "餐廳 3", {})],
)
PROBS = {"r1": 0.45, "r2": 0.35, "r3": 0.20}


class FakeRedis:
    """exists、get、set（nx、ex）、delete、incr、expire、pipeline（含 WATCH／MULTI／EXEC 交易）。

    每個 key 有版本號，寫入或過期就加一，給交易判斷「WATCH 之後有沒有被別人改過」。
    `before_exec` 可以放一個函式，下一次交易 EXEC 前會先執行一次，模擬別的 worker 剛好插進來。
    """

    def __init__(self):
        self.now = 1000.0
        self.data: dict[str, tuple[str, float | None]] = {}
        self.versions: dict[str, int] = {}
        self.before_exec = None

    def _touch(self, key):
        self.versions[key] = self.versions.get(key, 0) + 1

    def _alive(self, key):
        item = self.data.get(key)
        if item and item[1] is not None and self.now >= item[1]:
            del self.data[key]
            self._touch(key)
            return None
        return item

    def version(self, key):
        self._alive(key)
        return self.versions.get(key, 0)

    def exists(self, key):
        return int(self._alive(key) is not None)

    def get(self, key):
        item = self._alive(key)
        return None if item is None else item[0]

    def set(self, key, value, nx=False, ex=None):
        if nx and self._alive(key) is not None:
            return None
        self.data[key] = (str(value), None if ex is None else self.now + ex)
        self._touch(key)
        return True

    def delete(self, *keys):
        n = 0
        for k in keys:
            if self.data.pop(k, None) is not None:
                n += 1
                self._touch(k)
        return n

    def incr(self, key):
        item = self._alive(key)
        value = int(item[0]) + 1 if item else 1
        self.data[key] = (str(value), item[1] if item else None)
        self._touch(key)
        return value

    def expire(self, key, seconds):
        item = self._alive(key)
        if item is None:
            return False
        self.data[key] = (item[0], self.now + seconds)
        self._touch(key)
        return True

    def pipeline(self):
        return FakePipeline(self)


class FakePipeline:
    """沒有 WATCH 時把指令排起來，execute 一次跑完。WATCH 之後、MULTI 之前的指令馬上執行；
    execute 時被 WATCH 的 key 有變動就丟 WatchError，和 redis-py 的交易相同。"""

    def __init__(self, client):
        self.client, self.calls, self.watched, self.queued = client, [], None, False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.reset()

    def reset(self):
        self.calls, self.watched, self.queued = [], None, False

    def watch(self, *keys):
        self.watched = {k: self.client.version(k) for k in keys}

    def unwatch(self):
        self.watched = None

    def multi(self):
        self.queued = True

    def __getattr__(self, name):
        def call(*args, **kw):
            if self.watched is not None and not self.queued:
                return getattr(self.client, name)(*args, **kw)
            self.calls.append((name, args, kw))
            return self

        return call

    def execute(self):
        try:
            if self.watched is not None:
                hook, self.client.before_exec = self.client.before_exec, None
                if hook:
                    hook()
                if any(self.client.version(k) != v for k, v in self.watched.items()):
                    raise redis.WatchError("WATCH 的 key 被改過")
            return [getattr(self.client, n)(*a, **kw) for n, a, kw in self.calls]
        finally:
            self.reset()


class BrokenRedis:
    def __getattr__(self, name):
        def fail(*args, **kw):
            raise redis.ConnectionError("redis down")

        return fail


@pytest.fixture
def r():
    return FakeRedis()


def picker(store, **kw):
    # clock 固定：共用模式的到期只看 Redis 的過期時間，不看各自的時鐘
    return LlmPicker(
        base_url=BASE, model="qwen2.5:3b", timeout=1.0, clock=lambda: 0.0,
        breaker_store=store, **kw,
    )  # fmt: skip


def ok(choice="r2"):
    return httpx.Response(200, json={"response": json.dumps({"choice": choice})})


@respx.mock
def test_second_picker_sees_open_circuit(r):
    # 第一次規劃熔斷後，下一次規劃（新的 LlmPicker）直接走 circuit_open，不再等逾時
    route = respx.post(URL).mock(side_effect=httpx.ConnectTimeout("slow"))
    first = picker(RedisBreakerStore(r, BASE))
    assert [first.pick(QUESTION, PROBS).status for _ in range(2)] == ["timeout", "timeout"]
    second = picker(RedisBreakerStore(r, BASE))
    pick = second.pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm, pick.status) == ("r1", False, "circuit_open")
    assert pick.latency_ms is None
    assert route.call_count == 2


@respx.mock
def test_failures_add_up_across_pickers(r):
    # 兩個 worker 各失敗一次，加起來就熔斷
    route = respx.post(URL).mock(side_effect=httpx.ConnectError("x"))
    a, b, c = (picker(RedisBreakerStore(r, BASE)) for _ in range(3))
    assert a.pick(QUESTION, PROBS).status == "connect"
    assert b.pick(QUESTION, PROBS).status == "connect"
    assert c.pick(QUESTION, PROBS).status == "circuit_open"
    assert route.call_count == 2


@respx.mock
def test_only_one_probe_after_cooldown(r):
    route = respx.post(URL).mock(side_effect=httpx.ConnectError("x"))
    store = RedisBreakerStore(r, BASE)
    p = picker(store, breaker_cooldown=60)
    p.pick(QUESTION, PROBS)
    p.pick(QUESTION, PROBS)
    r.now += 59
    assert picker(store, breaker_cooldown=60).pick(QUESTION, PROBS).status == "circuit_open"
    r.now += 2
    # 冷卻結束：先搶到試探鎖的那一個去呼叫，其他的照樣熔斷
    prober, other = picker(store, breaker_cooldown=60), picker(store, breaker_cooldown=60)
    assert store.state(2, 6) == "probe"  # 模擬 prober 已經搶到鎖、還在等回應
    assert other.pick(QUESTION, PROBS).status == "circuit_open"
    assert route.call_count == 2
    r.delete(store.probe_key)
    assert prober.pick(QUESTION, PROBS).status == "connect"  # 試了，還是連不上
    assert other.pick(QUESTION, PROBS).status == "circuit_open"  # 再熔斷
    assert route.call_count == 3


@respx.mock
def test_successful_probe_clears_state(r):
    route = respx.post(URL).mock(
        side_effect=[httpx.ConnectError("x"), httpx.ConnectError("x"), ok("r2"), ok("r3")]
    )
    store = RedisBreakerStore(r, BASE)
    p = picker(store, breaker_cooldown=60)
    p.pick(QUESTION, PROBS)
    p.pick(QUESTION, PROBS)
    r.now += 61
    assert picker(store).pick(QUESTION, PROBS).status == "ok"
    # 失敗次數、熔斷、試探鎖都清掉
    assert not any(r.exists(k) for k in (store.failures_key, store.open_key, store.probe_key))
    assert picker(store).pick(QUESTION, PROBS).code == "r3"
    assert route.call_count == 4


@respx.mock
def test_probe_lock_expires_if_prober_dies(r):
    route = respx.post(URL).mock(side_effect=[httpx.ConnectError("x")] * 2 + [ok()])
    store = RedisBreakerStore(r, BASE)
    p = picker(store, breaker_cooldown=60)
    p.pick(QUESTION, PROBS)
    p.pick(QUESTION, PROBS)
    r.now += 61
    assert store.state(2, 6) == "probe"  # 搶到鎖的程序沒有回報就掛了
    assert picker(store).pick(QUESTION, PROBS).status == "circuit_open"
    r.now += 7  # 試探鎖過期（逾時 1 秒 + 5 秒）
    assert picker(store).pick(QUESTION, PROBS).status == "ok"
    assert route.call_count == 3


@respx.mock
def test_redis_error_calls_llm_as_usual(caplog):
    route = respx.post(URL).mock(side_effect=[httpx.ConnectError("x")] * 3 + [ok()])
    p = picker(RedisBreakerStore(BrokenRedis(), BASE))
    statuses = [p.pick(QUESTION, PROBS).status for _ in range(4)]
    assert statuses == ["connect", "connect", "connect", "ok"]  # 讀不到狀態就不熔斷
    assert route.call_count == 4
    assert "讀 LLM 熔斷狀態失敗" in caplog.text
    assert "寫 LLM 熔斷狀態失敗" in caplog.text


@respx.mock
def test_breaker_disabled_ignores_store(r):
    route = respx.post(URL).mock(return_value=httpx.Response(503))
    p = picker(RedisBreakerStore(r, BASE), breaker_failures=0)
    assert [p.pick(QUESTION, PROBS).status for _ in range(3)] == ["http"] * 3
    assert route.call_count == 3
    assert r.data == {}


def test_store_keys_are_per_ollama(r):
    store = RedisBreakerStore(r, BASE)
    assert store.open_key == f"llm:breaker:v1:{BASE}:open"
    assert store.failures_key.endswith(":failures") and store.probe_key.endswith(":probe")


def settings(monkeypatch, **kw) -> Settings:
    for name in ("LLM_MODE", "LLM_BREAKER_SHARED"):
        monkeypatch.delenv(name, raising=False)
    return Settings(_env_file=None, **kw)


def test_make_llm_uses_redis_store_by_default(monkeypatch, r):
    llm = make_llm(settings(monkeypatch), r)
    assert isinstance(llm.breaker_store, RedisBreakerStore) and llm.breaker_store.client is r


def test_make_llm_shared_can_be_turned_off(monkeypatch, r):
    assert make_llm(settings(monkeypatch, llm_breaker_shared=False), r).breaker_store is None


def test_make_llm_without_redis_keeps_in_memory(monkeypatch):
    assert make_llm(settings(monkeypatch)).breaker_store is None


# ── 多個 worker 同時讀寫（2026-11-08 跨廠商審查發現） ──


def test_probe_in_progress_blocks_after_failures_expire(r):
    # 試探途中失敗次數過期了，別的 worker 也不能同時去呼叫
    store = RedisBreakerStore(r, BASE)
    for _ in range(2):
        store.record_failure(2, 2)  # 熔斷 2 秒、失敗次數留 4 秒
    r.now += 3  # 熔斷到期，失敗次數還在
    assert store.state(2, 6) == "probe"  # 這個 worker 去試，鎖 6 秒
    r.now += 2  # 失敗次數過期，試探鎖還在
    assert RedisBreakerStore(r, BASE).state(2, 6) == "open"


@respx.mock
def test_failed_probe_reopens_even_if_failures_expired(r):
    store = RedisBreakerStore(r, BASE)
    for _ in range(2):
        store.record_failure(2, 2)
    r.now += 3

    def slow(request):
        r.now += 2  # 呼叫途中失敗次數過期
        raise httpx.ConnectTimeout("slow")

    route = respx.post(URL).mock(side_effect=slow)
    assert picker(store, breaker_cooldown=2).pick(QUESTION, PROBS).status == "timeout"
    assert RedisBreakerStore(r, BASE).state(2, 6) == "open"  # 試探失敗一律重新熔斷
    assert route.call_count == 1


def test_probe_lock_value_identifies_owner(r):
    a, b = RedisBreakerStore(r, BASE), RedisBreakerStore(r, BASE)
    for _ in range(2):
        a.record_failure(2, 60)
    r.now += 61
    assert a.state(2, 6) == "probe"
    assert r.get(a.probe_key) == a.token != b.token


# ── 交易和試探租約（2026-11-08 跨廠商複審發現） ──


def other(r):
    return RedisBreakerStore(r, BASE)


def test_success_between_read_and_write_restarts_failure(r):
    # record_failure 讀完次數、寫入之前，別的 worker 成功清掉狀態：交易重來，從 0 開始數，不會開熔斷
    store = other(r)
    store.record_failure(2, 60)
    r.before_exec = lambda: other(r).record_success()
    assert store.record_failure(2, 60) == 1
    assert not r.exists(store.open_key)
    assert store.state(2, 6) == "closed"


def test_own_probe_failure_does_not_revive_cleared_state(r):
    # 自己的試探失敗、失敗次數中途過期，寫入前剛好有別的請求成功：不能把清掉的狀態補回門檻
    store = other(r)
    for _ in range(2):
        store.record_failure(2, 2)
    r.now += 3
    assert store.state(2, 6) == "probe"
    r.now += 2  # 失敗次數過期，試探租約還在
    r.before_exec = lambda: other(r).record_success()
    assert store.record_failure(2, 2) == 1
    assert other(r).state(2, 6) == "closed"


def test_concurrent_reopen_wins_over_probe(r):
    # 要搶試探租約時，在途的失敗剛好回來重新熔斷：交易重來，看到新的熔斷，不去試
    store = other(r)
    for _ in range(2):
        store.record_failure(2, 60)
    r.now += 61
    r.before_exec = lambda: other(r).record_failure(2, 60)
    assert store.state(2, 6) == "open"
    assert r.exists(store.open_key) and not r.exists(store.probe_key)
    assert store.token is None


def test_late_success_from_expired_probe_keeps_new_holder(r):
    a, b = other(r), other(r)
    for _ in range(2):
        a.record_failure(2, 300)
    r.now += 301
    assert a.state(2, 35) == "probe"
    r.now += 36  # A 的租約過期
    assert b.state(2, 35) == "probe"  # B 接手試探
    a.record_success()  # A 遲到的成功
    assert r.get(b.probe_key) == b.token
    assert other(r).state(2, 35) == "open"  # B 還在試，第三個 worker 不能呼叫


def test_late_failure_from_expired_probe_is_ignored(r):
    a, b = other(r), other(r)
    for _ in range(2):
        a.record_failure(2, 300)
    r.now += 301
    assert a.state(2, 35) == "probe"
    r.now += 36
    assert b.state(2, 35) == "probe"
    assert a.record_failure(2, 300) == 2  # 不動狀態，回傳目前的次數
    assert not r.exists(b.open_key)
    assert r.get(b.probe_key) == b.token


def test_expired_probe_without_takeover_counts_as_normal_failure(r):
    # 租約過期、也沒有人接手時，回報當作一般失敗；失敗次數也過期了，就從 1 開始數
    store = other(r)
    for _ in range(2):
        store.record_failure(2, 2)
    r.now += 3
    assert store.state(2, 6) == "probe"
    r.now += 7  # 租約（6 秒）和失敗次數都過期
    assert store.record_failure(2, 2) == 1
    assert other(r).state(2, 6) == "closed"


def test_normal_failure_keeps_someone_elses_probe(r):
    a, b = other(r), other(r)
    for _ in range(2):
        a.record_failure(2, 60)
    r.now += 61
    assert b.state(2, 6) == "probe"
    assert a.record_failure(2, 60) == 3  # 在途的一般失敗：重新熔斷，但不刪 B 的租約
    assert r.exists(a.open_key) and r.get(b.probe_key) == b.token


def test_contention_falls_back_to_open(r, caplog):
    store = other(r)
    for _ in range(2):
        store.record_failure(2, 60)
    r.now += 61

    def churn():  # 每一次 EXEC 前都有人改
        r.incr(store.failures_key)
        r.before_exec = churn

    r.before_exec = churn
    assert store.state(2, 6) == "open"
    r.before_exec = None
    assert "一直被其他 worker 改動" in caplog.text
    assert not r.exists(store.probe_key)


# ── 第三輪複審（2026-11-08）：放行前驗證、試探世代 ──


def test_closed_is_validated_against_concurrent_probe(r):
    # 讀完「沒有租約」到放行之間，別人拿到了租約：放行前的空交易會發現，重來後看到租約
    store = other(r)
    for _ in range(2):
        store.record_failure(2, 300)
    r.now += 601  # 失敗次數也過期了
    r.before_exec = lambda: r.set(store.probe_key, "someone", ex=35)
    assert store.state(2, 35) == "open"


def test_late_success_after_new_probe_failed_is_ignored(r):
    a, b = other(r), other(r)
    for _ in range(2):
        a.record_failure(2, 300)
    r.now += 301
    assert a.state(2, 35) == "probe"
    r.now += 36  # A 的租約過期
    assert b.state(2, 35) == "probe"
    b.record_failure(2, 300)  # B 試探失敗，重新熔斷並刪掉自己的租約
    a.record_success()  # A 遲到的成功：之後發出過新的試探，不能清掉 B 剛開的熔斷
    assert r.exists(a.open_key)
    assert other(r).state(2, 35) == "open"


def test_late_failure_after_new_probe_succeeded_is_ignored(r):
    a, b = other(r), other(r)
    for _ in range(2):
        a.record_failure(2, 300)
    r.now += 301
    assert a.state(2, 35) == "probe"
    r.now += 36
    assert b.state(2, 35) == "probe"
    b.record_success()  # B 試探成功，狀態清除
    assert a.record_failure(2, 300) == 0  # A 遲到的失敗不重新計數
    assert other(r).state(2, 35) == "closed"
