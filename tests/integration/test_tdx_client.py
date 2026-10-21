"""真的 TDX 用戶端：用 respx 模擬 TDX，token 存在測試用的 Redis。"""

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest
import redis
import respx

from app.tdx import ROUTING_URL, TOKEN_KEY, TOKEN_URL, TdxError, TdxTransit
from app.transit import Endpoint

TZ = ZoneInfo("Asia/Taipei")
FIXTURES = Path(__file__).parent.parent / "fixtures" / "tdx"
A = Endpoint("sta1", "station", "中壢", 24.9537, 121.2257, rail=True)
B = Endpoint("hub1", "hub", "桃園站", 24.9891, 121.3138, rail=True)


def fixture(name):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


@pytest.fixture
def r(redis_url):
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    client.flushdb()
    yield client
    client.flushdb()


def make(r, rates=None):
    return TdxTransit("id", "secret", r, rates=rates, sleep=lambda s: None)


def token_ok():
    return httpx.Response(200, json={"access_token": "tok-1", "expires_in": 86400})


@respx.mock
def test_token_is_cached_and_shared(r):
    token = respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(ROUTING_URL).mock(return_value=httpx.Response(200, json=fixture("routing_tra")))
    at = datetime(2026, 10, 21, 17, 10, tzinfo=TZ)
    make(r).route(A, B, at, "depart")
    make(r).route(A, B, at, "depart")  # 另一個 worker
    assert token.call_count == 1
    assert 0 < r.ttl(TOKEN_KEY) <= 86400 - 300
    body = token.calls[0].request.content.decode()
    assert "grant_type=client_credentials" in body


@respx.mock
def test_fixed_params_and_time_format(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    route = respx.get(ROUTING_URL).mock(
        return_value=httpx.Response(200, json=fixture("routing_tra"))
    )
    make(r).route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart", top=1)
    params = dict(route.calls[0].request.url.params)
    assert params["depart"] == "2026-10-21T17:10:00"
    assert params["first_mile_mode"] == "0" and params["last_mile_mode"] == "0"
    assert params["transit"] == "3,4,5,6,7"
    assert params["first_mile_time"] == "20" and params["last_mile_time"] == "20"
    assert params["top"] == "5"  # 時間不準，多要幾條再篩
    assert params["origin"] == "24.9537,121.2257"
    assert route.calls[0].request.headers["authorization"] == "Bearer tok-1"


@respx.mock
def test_relaxed_results_are_filtered(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(ROUTING_URL).mock(return_value=httpx.Response(200, json=fixture("routing_tra")))
    at = datetime(2026, 10, 21, 17, 10, tzinfo=TZ)
    routes = make(r).route(A, B, at, "depart", top=3)
    # 17:05:52 出門的那條比要求的早，要刷掉
    assert len(routes) == 2
    assert all(x.leave_at >= at for x in routes)


@respx.mock
def test_arrival_filters_late_ones_and_puts_latest_first(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(ROUTING_URL).mock(
        return_value=httpx.Response(200, json=fixture("routing_mixed_arrival"))
    )
    at = datetime(2026, 10, 21, 23, 0, tzinfo=TZ)
    routes = make(r).route(B, A, at, "arrival", top=3)
    # 23:01 才到的兩條刷掉，只剩 22:16 到的公車
    assert [x.summary for x in routes] == ["公車 703"]
    assert routes[0].fare == 18


@respx.mock
def test_fare_is_estimated_when_tdx_has_no_price(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(ROUTING_URL).mock(return_value=httpx.Response(200, json=fixture("routing_tra")))
    routes = make(r).route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart")
    assert routes[0].fare == 16
    assert routes[0].fare_estimated is True


@respx.mock
def test_bus_fare_from_tdx_is_not_estimated(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(ROUTING_URL).mock(
        return_value=httpx.Response(200, json=fixture("routing_mixed_arrival"))
    )
    routes = make(r).route(B, A, datetime(2026, 10, 21, 23, 0, tzinfo=TZ), "arrival")
    assert routes[0].fare == 18 and routes[0].fare_estimated is False


@respx.mock
def test_401_refreshes_token_once(r):
    r.set(TOKEN_KEY, "expired")
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(ROUTING_URL).mock(
        side_effect=[
            httpx.Response(401, json={"result": "fail"}),
            httpx.Response(200, json=fixture("routing_tra")),
        ]
    )
    routes = make(r).route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart")
    assert routes
    assert r.get(TOKEN_KEY) == "tok-1"


@respx.mock
def test_5xx_retries_then_gives_up(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    routing = respx.get(ROUTING_URL).mock(return_value=httpx.Response(500))
    with pytest.raises(TdxError):
        make(r).route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart")
    assert routing.call_count == 3  # 第一次 ＋ 重試 2 次


@respx.mock
def test_4xx_is_not_retried(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    routing = respx.get(ROUTING_URL).mock(return_value=httpx.Response(400, json={"error": {}}))
    with pytest.raises(TdxError):
        make(r).route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart")
    assert routing.call_count == 1


def test_missing_keys_is_a_clear_error(r):
    with pytest.raises(TdxError, match="TDX_CLIENT_ID"):
        TdxTransit("", "", r)


@respx.mock
def test_every_attempt_waits_for_the_rate_limit(r):
    # 重試也要算進每分鐘 5 次（2026-10-21：使用者要求不能超過上限）
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    routing = respx.get(ROUTING_URL).mock(return_value=httpx.Response(500))
    waits = []
    tdx = TdxTransit("id", "secret", r, sleep=lambda s: None, limiter=lambda: waits.append(1))
    with pytest.raises(TdxError):
        tdx.route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart")
    assert routing.call_count == 3
    assert len(waits) == 3


@respx.mock
def test_basic_calls_count_points_per_attempt(r):
    from app.tdx import BASIC_URL

    respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(f"{BASIC_URL}/v2/Rail/THSR/Station").mock(
        side_effect=[httpx.Response(503), httpx.Response(200, json=[])]
    )
    tdx = TdxTransit("id", "secret", r, sleep=lambda s: None, points_limit=9000)
    assert tdx.get_basic("/v2/Rail/THSR/Station") == []
    key = next(iter(r.keys("quota:tdx_points:*")))
    assert int(r.get(key)) == 4  # 兩次請求，各 2 單位


@respx.mock
def test_points_exhausted_stops_before_calling(r):
    from app.redis_utils.quota import add_usage
    from app.tdx import TdxQuotaExhausted

    add_usage(r, "tdx_points", 9000)
    route = respx.get(url__regex=r".*/api/advanced/.*").mock(
        return_value=httpx.Response(200, json=[])
    )
    tdx = TdxTransit("id", "secret", r, sleep=lambda s: None, points_limit=9000)
    with pytest.raises(TdxQuotaExhausted):
        tdx.get_advanced("/V3/Map/GeoCode/Coordinate/Markname/x")
    assert route.call_count == 0
