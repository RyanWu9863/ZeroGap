from datetime import datetime
from zoneinfo import ZoneInfo

from app.planning.opening_hours import OpeningHours

TZ = ZoneInfo("Asia/Taipei")


def at(day: int, hh: int, mm: int = 0) -> datetime:
    # 2026-10-19 是星期一
    return datetime(2026, 10, day, hh, mm, tzinfo=TZ)


def test_simple_every_day():
    oh = OpeningHours.parse("Mo-Su 11:00-21:30")
    assert oh.interval_containing(at(22, 20)) == (at(22, 11), at(22, 21, 30))
    assert oh.interval_containing(at(22, 21, 30)) is None
    assert oh.interval_containing(at(22, 10, 59)) is None


def test_split_lunch_and_dinner():
    oh = OpeningHours.parse("Mo-Su 11:30-14:00,17:00-21:00")
    assert oh.interval_containing(at(22, 15)) is None
    assert oh.interval_containing(at(22, 18)) == (at(22, 17), at(22, 21))


def test_weekday_rules_and_closed_day():
    oh = OpeningHours.parse("Mo-Fr 17:00-22:00; Sa,Su 11:00-22:00; We off")
    assert oh.interval_containing(at(21, 18)) is None  # 星期三公休
    assert oh.interval_containing(at(24, 12)) == (at(24, 11), at(24, 22))  # 星期六


def test_overnight_belongs_to_previous_day():
    oh = OpeningHours.parse("Mo-Su 18:00-02:00")
    # 星期四 01:00 是星期三晚上那段的延續
    assert oh.interval_containing(at(23, 1)) == (at(22, 18), at(23, 2))


def test_24_7():
    oh = OpeningHours.parse("24/7")
    start, end = oh.interval_containing(at(22, 3))
    assert start <= at(22, 3) < end


def test_unparseable_returns_none():
    assert OpeningHours.parse("Mo-Fr 11:00-14:00 || PH off") is None
    assert OpeningHours.parse("sunrise-sunset") is None
    assert OpeningHours.parse("") is None
    assert OpeningHours.parse(None) is None


def test_next_opening_within_limit():
    oh = OpeningHours.parse("Mo-Su 11:30-14:00,17:00-21:00")
    assert oh.next_opening(at(22, 16, 50), within_minutes=30) == (at(22, 17), at(22, 21))
    assert oh.next_opening(at(22, 16, 29), within_minutes=30) is None
    # 已經開著就不算「等開門」
    assert oh.next_opening(at(22, 18), within_minutes=30) is None


def test_next_opening_after_midnight():
    oh = OpeningHours.parse("Mo-Su 00:10-03:00")
    assert oh.next_opening(at(22, 23, 50), within_minutes=30) == (at(23, 0, 10), at(23, 3))
