"""去程整段走路時提早 10 分鐘到（2026-10-21 使用者決定）。"""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.planner import _walk_earlier
from app.planning.types import Route

TZ = ZoneInfo("Asia/Taipei")


def t(hh, mm=0):
    return datetime(2026, 10, 21, hh, mm, tzinfo=TZ)


WALK = Route(summary="步行", fare=0, depart_at=t(18, 39), arrive_at=t(18, 39),
             board_name="桃園", alight_name="桃園", walk_after=6, walk_only=True)  # fmt: skip


def test_walk_arrives_10_minutes_earlier():
    r = _walk_earlier(WALK, 10, t(17, 30))
    assert r.leave_at == t(18, 29) and r.reach_at == t(18, 35)


def test_not_earlier_than_earliest_departure():
    r = _walk_earlier(WALK, 10, t(18, 35))
    assert r.leave_at == t(18, 35)


def test_transit_routes_unchanged():
    bus = Route(summary="公車", fare=18, depart_at=t(18, 0), arrive_at=t(18, 10),
                board_name="A", alight_name="B")  # fmt: skip
    assert _walk_earlier(bus, 10, t(17, 0)) is bus
