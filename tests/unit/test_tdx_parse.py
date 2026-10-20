"""TDX 旅運規劃回應的解析。測試資料是 2026-10-20 用金鑰實際查到的回應（tests/fixtures/tdx）。"""

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app.tdx import parse_routes

TZ = ZoneInfo("Asia/Taipei")
FIXTURES = Path(__file__).parent.parent / "fixtures" / "tdx"


def load(name):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def t(hh, mm, ss=0):
    return datetime(2026, 10, 21, hh, mm, ss, tzinfo=TZ)


def test_tra_route():
    routes = parse_routes(load("routing_tra"))
    assert len(routes) == 3
    # TDX 回傳的順序不照時間，依出發時間排
    assert [r.start_at for r in routes] == [t(17, 5, 52), t(17, 11, 52), t(17, 23, 52)]
    r = routes[1]
    assert r.depart_at == t(17, 13) and r.arrive_at == t(17, 23)
    assert r.end_at == t(17, 23, 46)
    assert r.summary == "台鐵（往基隆）"
    assert (r.board_name, r.alight_name) == ("中壢", "桃園")
    assert r.transfers == 0
    assert r.fare is None  # 用到台鐵時 TDX 不給車資


def test_bus_route_has_total_price():
    r = parse_routes(load("routing_bus_depart"))[0]
    assert r.summary == "公車 703"
    assert r.fare == 18
    assert (r.board_name, r.alight_name) == ("中壢火車站(中壢農會)", "南崁")


def test_transfer_summary():
    routes = parse_routes(load("routing_mixed_arrival"))
    two_legs = [r for r in routes if r.transfers == 1]
    assert two_legs[0].summary == "公車 201 → 台鐵（往新竹）"
    assert two_legs[0].board_name == "長榮"
    assert two_legs[0].alight_name == "中壢"


def test_to_route_rounds_walks_up():
    r = parse_routes(load("routing_tra"))[1]
    route = r.to_route(fare=25)
    # 17:11:52 出門 → 17:13 上車：步行 1 分 8 秒算 2 分鐘；17:23 下車 → 17:23:46 到：算 1 分鐘
    assert (route.walk_before, route.walk_after) == (2, 1)
    assert route.leave_at <= r.start_at
    assert route.reach_at >= r.end_at
    assert route.fare == 25
    assert route.depart_at == t(17, 13)


def test_empty_or_error_response():
    assert parse_routes({"result": "success", "data": {"routes": []}}) == []
    assert parse_routes({"result": "fail", "error": {"code": 20001, "msg": "x"}}) == []


def test_legs_keep_mode_and_endpoints():
    r = parse_routes(load("routing_mixed_arrival"))
    two_legs = [x for x in r if x.transfers == 1][0]
    assert [leg.mode for leg in two_legs.legs] == ["Bus", "TRA"]
    tra = two_legs.legs[1]
    assert (tra.from_name, tra.to_name) == ("桃園", "中壢")
    assert 9_000 < tra.straight_meters < 10_500


def test_fare_estimate():
    from app.tdx import FareRates, estimate_fare

    rates = FareRates()
    tra_only = parse_routes(load("routing_tra"))[0]
    # 中壢→桃園：直線約 9.8 公里 × 繞路 1.15 × 每公里 1.46 元 ≈ 16.5 → 16（最低 15）
    assert estimate_fare(tra_only, rates) == 16
    mixed = [x for x in parse_routes(load("routing_mixed_arrival")) if x.transfers == 1][0]
    # 公車段 18 ＋ 台鐵段 16
    assert estimate_fare(mixed, rates) == 18 + 16
    # 全程公車時有 TDX 的車資，不用估
    bus = parse_routes(load("routing_bus_depart"))[0]
    assert bus.fare == 18
