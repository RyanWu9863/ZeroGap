"""模擬版 TDX（示意）：結果固定、可重現，並且遵守 3.2 的時間檢查規則。"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.transit import Endpoint, MockTransit, haversine_m, valid_routes

TZ = ZoneInfo("Asia/Taipei")
ZHONGLI = Endpoint(key="sta1", kind="station", name="中壢", lat=24.9537, lng=121.2257, rail=True)
TAOYUAN = Endpoint(key="hub1", kind="hub", name="桃園站", lat=24.9891, lng=121.3138, rail=True)
CINEMA = Endpoint(key="cin3", kind="cinema", name="示意影城 桃園 A", lat=24.9930, lng=121.3010)


def t(hh: int, mm: int = 0, day: int = 22) -> datetime:
    return datetime(2026, 10, day, hh, mm, tzinfo=TZ)


@pytest.fixture
def tdx():
    return MockTransit()


def test_haversine():
    # 中壢到桃園大約 9.6 公里
    assert 9_000 < haversine_m(ZHONGLI.lat, ZHONGLI.lng, TAOYUAN.lat, TAOYUAN.lng) < 10_500


def test_depart_not_earlier_than_requested(tdx):
    routes = tdx.route(ZHONGLI, TAOYUAN, t(17, 3), "depart")
    assert len(routes) == 1
    r = routes[0]
    assert r.leave_at >= t(17, 3)
    assert r.depart_at == t(17, 10)  # 每 10 分鐘一班
    assert r.summary == "台鐵"  # 兩端都是軌道站
    assert r.board_name == "中壢" and r.alight_name == "桃園站"
    assert r.fare % 5 == 0 and r.fare >= 15


def test_arrival_not_later_than_requested(tdx):
    routes = tdx.route(TAOYUAN, ZHONGLI, t(23), "arrival")
    r = routes[0]
    assert r.reach_at <= t(23)
    # 再晚一班就趕不上
    assert r.reach_at + timedelta(minutes=10) > t(23)


def test_bus_and_walk_for_cinema(tdx):
    r = tdx.route(ZHONGLI, CINEMA, t(17), "depart")[0]
    assert r.summary == "公車"
    assert r.walk_before == 0
    assert r.walk_after == 5


def test_top_3_consecutive(tdx):
    dep = tdx.route(ZHONGLI, TAOYUAN, t(17, 3), "depart", top=3)
    assert [r.depart_at for r in dep] == [t(17, 10), t(17, 20), t(17, 30)]
    arr = tdx.route(TAOYUAN, ZHONGLI, t(23), "arrival", top=3)
    assert len(arr) == 3
    # 抵達期限：最晚的那班排第一
    assert arr[0].depart_at > arr[1].depart_at > arr[2].depart_at
    assert all(r.reach_at <= t(23) for r in arr)


def test_deterministic(tdx):
    a = tdx.route(ZHONGLI, CINEMA, t(17, 3), "depart", top=3)
    b = MockTransit().route(ZHONGLI, CINEMA, t(17, 3), "depart", top=3)
    assert a == b


def test_no_service_late_at_night(tdx):
    assert tdx.route(TAOYUAN, ZHONGLI, t(0, 30, day=23), "depart") == []
    # 01:30 前要到：最後一班 23:50 開的車
    r = tdx.route(TAOYUAN, ZHONGLI, t(1, 30, day=23), "arrival")[0]
    assert r.depart_at == t(23, 50)


def test_first_train_in_the_morning(tdx):
    r = tdx.route(ZHONGLI, TAOYUAN, t(4, 0), "depart")[0]
    assert r.depart_at == t(5, 30)


def test_valid_routes_drops_relaxed_results(tdx):
    # 真的 TDX 查不到時會自動放寬時間，回來的結果要再檢查一次
    early = tdx.route(ZHONGLI, TAOYUAN, t(17), "depart", top=3)
    assert valid_routes(early, t(17, 5), "depart") == early[1:]
    late = tdx.route(TAOYUAN, ZHONGLI, t(23), "arrival", top=3)
    assert valid_routes(late, late[1].reach_at, "arrival") == late[1:]
