"""worker 啟動時補抓的判斷。"""

from datetime import datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.jobs import startup
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


def test_retries_until_database_ready(monkeypatch):
    # 重開機時 worker 比 PostgreSQL 先起來：前兩次連不上，第三次才排進佇列
    calls = []

    def fake_enqueue(now, queued):
        calls.append(now)
        if len(calls) < 3:
            raise OSError("the database system is starting up")
        queued.append("atmovies")

    monkeypatch.setattr(startup, "enqueue_due", fake_enqueue)
    waits = []
    assert startup.main(attempts=5, wait=5.0, sleep=waits.append) == ["atmovies"]
    assert waits == [5.0, 5.0]


def test_retry_does_not_enqueue_twice(monkeypatch):
    # 排好第一個之後 Redis 斷掉，重試時已經排過的不能再排一次
    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def execute(self, _sql):
            return SimpleNamespace(all=lambda: [])  # 從來沒抓過：三個都要補

    enqueued = []
    failed = []

    class FakeQueue:
        def __init__(self, *args, **kwargs):
            pass

        def enqueue(self, func, **kwargs):
            if len(enqueued) == 1 and not failed:
                failed.append(True)
                raise ConnectionError("redis")
            enqueued.append(func)

    monkeypatch.setattr(startup, "sync_session", lambda: FakeSession)
    monkeypatch.setattr(startup, "Queue", FakeQueue)
    monkeypatch.setattr(startup, "rq_redis", lambda: None)
    monkeypatch.setattr(startup, "get_settings", lambda: SimpleNamespace(crawl_timeout_seconds=1))
    assert startup.main(attempts=3, wait=0, sleep=lambda _: None) == [
        "tdx_stations",
        "atmovies",
        "osm",
    ]
    assert enqueued == [func for _job, _age, func in startup.CHECKS]


def test_gives_up_without_blocking_worker(monkeypatch):
    def fake_enqueue(now, queued):
        raise OSError("connection refused")

    monkeypatch.setattr(startup, "enqueue_due", fake_enqueue)
    waits = []
    assert startup.main(attempts=3, wait=5.0, sleep=waits.append) == []
    assert waits == [5.0, 5.0]  # 最後一次失敗就不再等
