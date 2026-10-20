"""請求的時間換算（規格書 6.4）：latest_home 早於 06:00 算隔天，最晚到隔天 02:00。"""

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import pytest

from app.planning.times import resolve_times

TZ = ZoneInfo("Asia/Taipei")
D = date(2026, 10, 22)


def test_same_day():
    earliest, latest = resolve_times(D, time(17), time(23))
    assert earliest == datetime(2026, 10, 22, 17, tzinfo=TZ)
    assert latest == datetime(2026, 10, 22, 23, tzinfo=TZ)


def test_early_morning_is_next_day():
    _, latest = resolve_times(D, time(17), time(1, 30))
    assert latest == datetime(2026, 10, 23, 1, 30, tzinfo=TZ)


def test_two_am_is_the_limit():
    _, latest = resolve_times(D, time(17), time(2))
    assert latest == datetime(2026, 10, 23, 2, tzinfo=TZ)
    with pytest.raises(ValueError, match="02:00"):
        resolve_times(D, time(17), time(2, 1))
    with pytest.raises(ValueError, match="02:00"):
        resolve_times(D, time(17), time(5, 59))


def test_latest_must_be_after_earliest():
    with pytest.raises(ValueError, match="晚於最早出門"):
        resolve_times(D, time(17), time(17))
    with pytest.raises(ValueError, match="晚於最早出門"):
        resolve_times(D, time(17), time(16))
