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
    assert params["depart"] == "2026-10-21T17:25:00"  # 往後延 15 分鐘查（TDX 會給更早的）
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
def test_depart_retries_later_when_all_routes_are_too_early(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    route = respx.get(ROUTING_URL).mock(
        return_value=httpx.Response(200, json=fixture("routing_tra"))
    )
    # 範例的路線都在 17 點多出門，要求 18:00 出發就全部篩光：+15、+30、+45 分鐘各查一次就停
    at = datetime(2026, 10, 21, 18, 0, tzinfo=TZ)
    assert make(r).route(A, B, at, "depart") == []
    assert [c.request.url.params["depart"] for c in route.calls] == [
        "2026-10-21T18:15:00", "2026-10-21T18:30:00", "2026-10-21T18:45:00",
    ]  # fmt: skip


@respx.mock
def test_depart_stops_at_first_query_with_valid_routes(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    route = respx.get(ROUTING_URL).mock(
        return_value=httpx.Response(200, json=fixture("routing_tra"))
    )
    assert make(r).route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart")
    assert route.call_count == 1


@respx.mock
def test_depart_puts_fast_train_before_earlier_bus(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    # 公車 16:48 出門、17:34 才到；火車 17:05 出門、17:18 就到
    mixed = fixture("routing_bus_depart")
    mixed["data"]["routes"] = mixed["data"]["routes"][:1] + fixture("routing_tra")["data"]["routes"]
    respx.get(ROUTING_URL).mock(return_value=httpx.Response(200, json=mixed))
    at = datetime(2026, 10, 21, 16, 45, tzinfo=TZ)
    # 步驟 2 只取第一條，要的是「最早幾點能到」，不是最早出門的那條
    [first] = make(r).route(A, B, at, "depart")
    assert first.reach_at.strftime("%H:%M") == "17:18"
    routes = make(r).route(A, B, at, "depart", top=4)
    assert [x.reach_at.strftime("%H:%M") for x in routes] == ["17:18", "17:24", "17:34", "17:36"]


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
def test_rate_limited_waits_60_seconds_and_retries_once(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    route = respx.get(ROUTING_URL).mock(
        side_effect=[httpx.Response(429, json={"message": "API rate limit exceeded"}),
                     httpx.Response(200, json=fixture("routing_tra"))]
    )  # fmt: skip
    slept, waited = [], []
    tdx = TdxTransit("id", "secret", r, sleep=slept.append, on_rate_limited=waited.append)
    assert tdx.route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart")
    assert route.call_count == 2
    assert slept == [60] and waited == [60]


@respx.mock
def test_second_rate_limit_fails(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(ROUTING_URL).mock(return_value=httpx.Response(429, json={"message": "limit"}))
    with pytest.raises(TdxError, match="429"):
        make(r).route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart")


@respx.mock
def test_no_route_within_1km_becomes_walk(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    route = respx.get(ROUTING_URL).mock(
        return_value=httpx.Response(200, json={"result": "success", "data": {"routes": []}})
    )
    near = Endpoint("hub2", "hub", "中壢站", 24.9537, 121.2257, rail=True)  # 跟 A 同一點
    at = datetime(2026, 10, 21, 23, 30, tzinfo=TZ)
    routes = make(r).route(near, A, at, "arrival", top=3)
    assert route.call_count == 1
    assert len(routes) == 1 and routes[0].walk_only and routes[0].fare == 0
    assert routes[0].reach_at == at and routes[0].walk_after == 0
    # 出發：TDX 根本查不到時不往後延，直接改走路
    route.reset()
    assert make(r).route(A, near, at, "depart")[0].walk_only
    assert route.call_count == 1


@respx.mock
def test_bad_params_for_very_close_points_becomes_walk(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    bad = httpx.Response(
        404, json={"result": "fail", "error": {"code": 40001, "msg": "API spec params is wrong."}}
    )
    respx.get(ROUTING_URL).mock(return_value=bad)
    near = Endpoint("cin17", "cinema", "統領威秀", 24.9561, 121.2243, rail=False)  # 約 300 公尺
    routes = make(r).route(A, near, datetime(2026, 10, 21, 17, 45, tzinfo=TZ), "depart")
    assert routes[0].walk_only and routes[0].walk_after > 0
    # 深夜沒車也會回 40001：遠的就當作查不到，不讓整個規劃失敗
    assert make(r).route(A, B, datetime(2026, 10, 21, 23, 15, tzinfo=TZ), "depart") == []


@respx.mock
def test_no_route_far_away_stays_empty(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(ROUTING_URL).mock(
        return_value=httpx.Response(200, json={"result": "success", "data": {"routes": []}})
    )
    # A（中壢）→ B（桃園）約 9 公里
    assert make(r).route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart") == []


@respx.mock
def test_arrival_puts_latest_departure_first(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(ROUTING_URL).mock(
        return_value=httpx.Response(200, json=fixture("routing_mixed_arrival"))
    )
    at = datetime(2026, 10, 21, 23, 5, tzinfo=TZ)
    routes = make(r).route(B, A, at, "arrival", top=3)
    # 兩條都 23:02 到，22:15 出發的排在 22:04 出發的前面：「最晚要離開」要看出發時間
    assert [x.leave_at.strftime("%H:%M") for x in routes] == ["22:15", "22:04", "21:37"]


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


def bad_params():
    return httpx.Response(
        404, json={"result": "fail", "error": {"code": 40001, "msg": "API spec params is wrong."}}
    )


@respx.mock
def test_arrival_retries_earlier_after_bad_params(r):
    # 最晚到家比末班車晚太多時 TDX 回 40001，往前 30 分鐘再查（2026-10-27 實測）
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    ok = httpx.Response(200, json=fixture("routing_mixed_arrival"))
    route = respx.get(ROUTING_URL).mock(side_effect=[bad_params(), bad_params(), ok])
    routes = make(r).route(B, A, datetime(2026, 10, 21, 23, 30, tzinfo=TZ), "arrival", top=3)
    assert [c.request.url.params["arrival"] for c in route.calls] == [
        "2026-10-21T23:30:00", "2026-10-21T23:00:00", "2026-10-21T22:30:00",
    ]  # fmt: skip
    # 還是照要求的 23:30 檢查，23:01 到的兩條也算
    assert [x.leave_at.strftime("%H:%M") for x in routes] == ["22:15", "22:04", "21:37"]


@respx.mock
def test_arrival_gives_up_after_three_earlier_queries(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    route = respx.get(ROUTING_URL).mock(return_value=bad_params())
    assert make(r).route(B, A, datetime(2026, 10, 21, 23, 30, tzinfo=TZ), "arrival") == []
    assert route.call_count == 4


@respx.mock
def test_arrival_near_points_walk_without_retrying(r):
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    route = respx.get(ROUTING_URL).mock(return_value=bad_params())
    near = Endpoint("cin17", "cinema", "統領威秀", 24.9561, 121.2243, rail=False)  # 約 300 公尺
    routes = make(r).route(near, A, datetime(2026, 10, 21, 23, 30, tzinfo=TZ), "arrival")
    assert routes[0].walk_only
    assert route.call_count == 1


@respx.mock
def test_depart_puts_earliest_arrival_first(r):
    # 21:37 出門的那條改成 23:30 才到：比較早出門、比較晚到，不該排第一（2026-10-27）
    data = fixture("routing_mixed_arrival")
    for rt in data["data"]["routes"]:
        if "T21:37" in rt["start_time"]:
            rt["end_time"] = "2026-10-21T23:30:00"
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    respx.get(ROUTING_URL).mock(return_value=httpx.Response(200, json=data))
    routes = make(r).route(B, A, datetime(2026, 10, 21, 21, 30, tzinfo=TZ), "depart", top=3)
    # 兩條都 23:01 到，晚出門的排前面
    assert [x.leave_at.strftime("%H:%M") for x in routes] == ["22:15", "22:04", "21:37"]


@respx.mock
def test_connection_errors_are_retried_then_become_tdx_error(r):
    # DNS 失敗、連線被拒：跟逾時一樣重試，最後變成 TdxError，API 才回得出 UPSTREAM_ERROR
    respx.post(TOKEN_URL).mock(return_value=token_ok())
    routing = respx.get(ROUTING_URL).mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(TdxError):
        make(r).route(A, B, datetime(2026, 10, 21, 17, 10, tzinfo=TZ), "depart")
    assert routing.call_count == 3
