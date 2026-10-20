"""路線快取的時間取整與 key（規格書 5.2、5.3），以及每月額度的 key 和到期時間。"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.planning.types import Route
from app.redis_utils.cache import dump_routes, load_routes, round_slot, route_cache_key
from app.redis_utils.quota import jev_cost_micro_usd, quota_expire_at, quota_key

TZ = ZoneInfo("Asia/Taipei")


def t(hh: int, mm: int, day: int = 22, month: int = 10) -> datetime:
    return datetime(2026, month, day, hh, mm, tzinfo=TZ)


class TestRoundSlot:
    def test_depart_rounds_later(self):
        assert round_slot(t(18, 7), "depart") == t(18, 15)

    def test_arrival_rounds_earlier(self):
        assert round_slot(t(22, 58), "arrival") == t(22, 45)

    @pytest.mark.parametrize("mode", ["depart", "arrival"])
    def test_exact_slot_stays(self, mode):
        assert round_slot(t(18, 15), mode) == t(18, 15)

    def test_seconds_count(self):
        assert round_slot(t(18, 15).replace(second=1), "depart") == t(18, 30)
        assert round_slot(t(18, 15).replace(second=1), "arrival") == t(18, 15)

    def test_depart_across_midnight(self):
        assert round_slot(t(23, 50), "depart") == t(0, 0, day=23)

    def test_utc_input_is_rounded_in_taipei_time(self):
        utc = t(18, 7).astimezone(ZoneInfo("UTC"))
        assert round_slot(utc, "depart") == t(18, 15)


def test_route_cache_key():
    key = route_cache_key("sta12", "cin3", t(18, 15), "depart", 3)
    assert key == "tdx:route:v1:sta12:cin3:dep:202610221815:3"
    assert route_cache_key("hub1", "sta12", t(22, 45), "arrival", 1).endswith(":arr:202610222245:1")


def test_routes_round_trip():
    routes = [
        Route(summary="台鐵", fare=25, depart_at=t(17, 10), arrive_at=t(17, 30),
              board_name="中壢", alight_name="桃園", walk_after=5, transfers=1),
    ]  # fmt: skip
    assert load_routes(dump_routes(routes)) == routes
    assert load_routes(dump_routes([])) == []


def test_quota_key_uses_taipei_month():
    # UTC 10/31 17:00 已經是台灣 11/1 01:00
    utc = datetime(2026, 10, 31, 17, 0, tzinfo=ZoneInfo("UTC"))
    assert quota_key("google:details_enterprise", utc) == "quota:google:details_enterprise:2026-11"


def test_quota_expires_on_5th_of_next_month():
    assert quota_expire_at(t(9, 0, day=20)) == datetime(2026, 11, 5, tzinfo=TZ)
    assert quota_expire_at(datetime(2026, 12, 31, 23, 0, tzinfo=TZ)) == datetime(
        2027, 1, 5, tzinfo=TZ
    )


def test_jev_cost():
    # 每百萬 token 0.042 美元 → 每個 token 0.042 個百萬分之一美元，無條件進位
    assert jev_cost_micro_usd(1_000_000) == 42_000
    assert jev_cost_micro_usd(100) == 5
    assert jev_cost_micro_usd(0) == 0
