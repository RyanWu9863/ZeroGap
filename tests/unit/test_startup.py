"""worker 啟動時補抓的判斷。"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.jobs.startup import due

TZ = ZoneInfo("Asia/Taipei")
NOW = datetime(2026, 10, 21, 9, 0, tzinfo=TZ)


def test_never_succeeded():
    assert due(None, None, NOW)


def test_today_already_done():
    assert not due(datetime(2026, 10, 21, 6, 3, tzinfo=TZ), None, NOW)


def test_yesterday_is_due():
    assert due(datetime(2026, 10, 20, 18, 5, tzinfo=TZ), None, NOW)


def test_utc_timestamp_uses_taipei_date():
    # UTC 10/20 23:00 是台灣 10/21 07:00，算今天
    assert not due(datetime(2026, 10, 20, 23, 0, tzinfo=ZoneInfo("UTC")), None, NOW)


def test_weekly():
    assert not due(NOW - timedelta(days=6), timedelta(days=7), NOW)
    assert due(NOW - timedelta(days=7), timedelta(days=7), NOW)
