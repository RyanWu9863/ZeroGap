"""Redis 共用元件（規格書 5.3～5.5）。用 Redis 的第 15 號資料庫，每個測試前清空。"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
import redis

from app.planning.types import Route
from app.redis_utils.cache import CachedTransit
from app.redis_utils.lock import Lock, acquire, extend, release
from app.redis_utils.quota import add_usage, has_room, used
from app.redis_utils.ratelimit import ahit, hit, wait_for_slot
from app.transit import Endpoint, MockTransit

TZ = ZoneInfo("Asia/Taipei")


class TestRateLimit:
    def test_sixth_hit_in_window_is_blocked(self, r):
        for i in range(5):
            assert hit(r, "rl:test", limit=5, window_ms=60_000, now_ms=1_000 + i).allowed
        blocked = hit(r, "rl:test", limit=5, window_ms=60_000, now_ms=2_000)
        assert not blocked.allowed
        # 最早那一次在 1000，要到 61000 才滑出窗口
        assert blocked.retry_after_ms == 59_000

    def test_allowed_again_after_window(self, r):
        for i in range(5):
            hit(r, "rl:test", limit=5, window_ms=60_000, now_ms=1_000 + i)
        assert not hit(r, "rl:test", limit=5, window_ms=60_000, now_ms=60_999).allowed
        assert hit(r, "rl:test", limit=5, window_ms=60_000, now_ms=61_001).allowed

    def test_blocked_hits_are_not_counted(self, r):
        for i in range(5):
            hit(r, "rl:test", limit=5, window_ms=1_000, now_ms=i)
        for i in range(10):
            hit(r, "rl:test", limit=5, window_ms=1_000, now_ms=500 + i)
        assert r.zcard("rl:test") == 5

    def test_zero_limit_blocks_everything(self, r):
        result = hit(r, "rl:test", limit=0, window_ms=60_000, now_ms=0)
        assert not result.allowed
        assert result.retry_after_ms == 60_000

    def test_key_expires_with_window(self, r):
        hit(r, "rl:test", limit=5, window_ms=60_000)
        assert 0 < r.pttl("rl:test") <= 60_000

    def test_wait_for_slot_reports_waiting(self, r):
        clock = {"now": 0}
        waits = []

        def sleep(seconds):
            clock["now"] += int(seconds * 1000)

        for i in range(5):
            hit(r, "rl:tdx", limit=5, window_ms=60_000, now_ms=i)
        wait_for_slot(
            r, "rl:tdx", limit=5, window_ms=60_000,
            on_wait=waits.append, sleep=sleep, clock_ms=lambda: clock["now"],
        )  # fmt: skip
        assert waits == [60_000]
        assert clock["now"] >= 60_000

    async def test_async_client(self, ar):
        for i in range(2):
            assert (await ahit(ar, "rl:api", limit=2, window_ms=60_000, now_ms=i)).allowed
        assert not (await ahit(ar, "rl:api", limit=2, window_ms=60_000, now_ms=10)).allowed


class TestLock:
    def test_only_one_holder(self, r):
        token = acquire(r, "job:refresh_daily", ttl_ms=600_000)
        assert token
        assert acquire(r, "job:refresh_daily") is None
        assert 0 < r.pttl("lock:job:refresh_daily") <= 600_000

    def test_cannot_release_someone_elses_lock(self, r):
        token = acquire(r, "job:x")
        assert release(r, "job:x", "not-my-token") is False
        assert r.exists("lock:job:x")
        assert release(r, "job:x", token) is True
        assert not r.exists("lock:job:x")

    def test_extend_only_own_lock(self, r):
        token = acquire(r, "job:x", ttl_ms=1_000)
        assert extend(r, "job:x", "other", ttl_ms=600_000) is False
        assert r.pttl("lock:job:x") <= 1_000
        assert extend(r, "job:x", token, ttl_ms=600_000) is True
        assert r.pttl("lock:job:x") > 1_000

    def test_context_manager(self, r):
        with Lock(r, "job:x") as lock:
            assert lock.acquired
            with Lock(r, "job:x") as other:
                assert not other.acquired
        assert not r.exists("lock:job:x")


class TestQuota:
    NOW = datetime(2026, 10, 20, 12, 0, tzinfo=TZ)

    def test_count_and_room(self, r):
        assert used(r, "google:details_enterprise", self.NOW) == 0
        assert has_room(r, "google:details_enterprise", limit=950, now=self.NOW)
        add_usage(r, "google:details_enterprise", 950, now=self.NOW)
        assert used(r, "google:details_enterprise", self.NOW) == 950
        assert not has_room(r, "google:details_enterprise", limit=950, now=self.NOW)

    def test_amount_must_fit(self, r):
        # 進階呼叫一次 15 單位：剩 10 單位時不能呼叫
        add_usage(r, "tdx_points", 8_990, now=self.NOW)
        assert has_room(r, "tdx_points", limit=9_000, amount=10, now=self.NOW)
        assert not has_room(r, "tdx_points", limit=9_000, amount=15, now=self.NOW)

    def test_expires_on_5th_of_next_month(self, r):
        add_usage(r, "tdx_points", 2, now=self.NOW)
        expire_at = r.expiretime("quota:tdx_points:2026-10")
        assert expire_at == int(datetime(2026, 11, 5, tzinfo=TZ).timestamp())

    def test_new_month_starts_from_zero(self, r):
        add_usage(r, "tdx_points", 100, now=self.NOW)
        assert used(r, "tdx_points", datetime(2026, 11, 1, 0, 1, tzinfo=TZ)) == 0


class CountingTransit(MockTransit):
    def __init__(self):
        self.calls = []

    def route(self, origin, dest, at, mode, top=1):
        self.calls.append((origin.key, dest.key, at, mode, top))
        return super().route(origin, dest, at, mode, top)


class TestCachedTransit:
    A = Endpoint(key="sta1", kind="station", name="中壢", lat=24.9537, lng=121.2257, rail=True)
    B = Endpoint(key="hub1", kind="hub", name="桃園站", lat=24.9891, lng=121.3138, rail=True)

    def test_second_query_in_same_slot_hits_cache(self, r):
        inner = CountingTransit()
        cached = CachedTransit(inner, r)
        first = cached.route(self.A, self.B, datetime(2026, 10, 22, 18, 7, tzinfo=TZ), "depart")
        second = cached.route(self.A, self.B, datetime(2026, 10, 22, 18, 12, tzinfo=TZ), "depart")
        assert first == second
        # 18:07 和 18:12 都取整成 18:15，只查一次
        assert inner.calls == [
            ("sta1", "hub1", datetime(2026, 10, 22, 18, 15, tzinfo=TZ), "depart", 1)
        ]
        key = "tdx:route:v1:sta1:hub1:dep:202610221815:1"  # 預設版本
        assert 0 < r.ttl(key) <= 6 * 3600

    def test_rounded_results_still_meet_the_request(self, r):
        cached = CachedTransit(MockTransit(), r)
        at = datetime(2026, 10, 22, 22, 58, tzinfo=TZ)
        routes = cached.route(self.B, self.A, at, "arrival", top=3)
        assert routes and all(x.reach_at <= at for x in routes)

    def test_before_call_hook_runs_only_on_miss(self, r):
        calls = []
        cached = CachedTransit(MockTransit(), r, before_call=lambda: calls.append(1))
        at = datetime(2026, 10, 22, 18, 7, tzinfo=TZ)
        cached.route(self.A, self.B, at, "depart")
        cached.route(self.A, self.B, at, "depart")
        assert calls == [1]

    def test_empty_result_is_cached_only_10_minutes(self, r):
        class NoRoute(CountingTransit):
            def route(self, origin, dest, at, mode, top=1):
                self.calls.append(at)
                return []

        inner = NoRoute()
        cached = CachedTransit(inner, r)
        at = datetime(2026, 10, 22, 18, 15, tzinfo=TZ)
        assert cached.route(self.A, self.B, at, "depart") == []
        assert cached.route(self.A, self.B, at, "depart") == []
        assert len(inner.calls) == 1  # 10 分鐘內不重查
        assert 0 < r.ttl("tdx:route:v1:sta1:hub1:dep:202610221815:1") <= 600

    def test_walk_only_route_is_not_rounded(self, r):
        class WalkOnly(CountingTransit):
            def route(self, origin, dest, at, mode, top=1):
                return [Route(summary="步行", fare=0, depart_at=at, arrive_at=at,
                              board_name="中壢站", alight_name="中壢站", walk_after=0,
                              walk_only=True)]  # fmt: skip

        cached = CachedTransit(WalkOnly(), r)
        at = datetime(2026, 10, 22, 22, 55, tzinfo=TZ)
        # 查詢時取整成 23:00，但走路不用等車：22:55 出發、22:55 到
        assert cached.route(self.A, self.B, at, "depart")[0].reach_at == at

    def test_cache_failure_falls_back_to_inner(self):
        class BrokenRedis:
            def get(self, key):
                raise redis.ConnectionError("down")

            def set(self, *args, **kwargs):
                raise redis.ConnectionError("down")

        broken = BrokenRedis()
        inner = CountingTransit()
        at = datetime(2026, 10, 22, 18, 7, tzinfo=TZ)
        assert CachedTransit(inner, broken).route(self.A, self.B, at, "depart")
        assert len(inner.calls) == 1


@pytest.fixture
def r(redis_url):
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    client.flushdb()
    yield client
    client.flushdb()
    client.close()


@pytest.fixture
async def ar(redis_url):
    import redis.asyncio as aioredis

    client = aioredis.Redis.from_url(redis_url, decode_responses=True)
    await client.flushdb()
    yield client
    await client.flushdb()
    await client.aclose()
