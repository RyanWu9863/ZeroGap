"""`rq cron` 的排程要照台北時間觸發（規格書 5.6）。

rq 2.12 用 UTC 的現在時間交給 croniter 算下一次，容器的 `TZ` 沒有作用：
原本寫 `0 6 * * *` 會在台北 14:00 才跑（2026-10-27 審查發現）。
"""

import importlib
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from croniter import croniter
from rq import cron

TZ = ZoneInfo("Asia/Taipei")

# 名稱 → (台北的時, 分, 星期幾；None 是每天，0 是週日)
EXPECTED = {
    "atmovies-morning": (6, 0, None),
    "atmovies-evening": (18, 0, None),
    "osm": (6, 30, None),
    "tdx-stations": (4, 0, 1),
    "hubs": (4, 30, 1),
    "google-places": (5, 0, 1),
    "google-geom": (3, 0, None),
}


@pytest.fixture(scope="module")
def registered() -> dict[str, str]:
    """重新載入 cron_config，拿到每個工作註冊的 cron 字串。"""
    saved = list(cron._job_data_registry)
    cron._job_data_registry.clear()
    try:
        importlib.reload(importlib.import_module("app.jobs.cron_config"))
        return {j["name"]: j["cron"] for j in cron._job_data_registry}
    finally:
        cron._job_data_registry[:] = saved


def _fires_in_taipei(expr: str, start: datetime, n: int = 8) -> list[datetime]:
    """跟 rq 一樣從 UTC 的時間往後算，換成台北時間。"""
    it = croniter(expr, start)
    return [it.get_next(datetime).astimezone(TZ) for _ in range(n)]


def test_all_jobs_registered(registered):
    assert set(registered) == set(EXPECTED)


@pytest.mark.parametrize("name", sorted(EXPECTED))
@pytest.mark.parametrize(
    "start",
    [
        datetime(2026, 10, 29, 0, 0, tzinfo=UTC),  # 台北 08:00
        datetime(2026, 11, 1, 19, 59, tzinfo=UTC),  # 台北週一 03:59，跨日、跨週
    ],
)
def test_fires_on_taipei_time(registered, name, start):
    hour, minute, weekday = EXPECTED[name]
    for t in _fires_in_taipei(registered[name], start):
        assert (t.hour, t.minute) == (hour, minute), f"{name} 在台北 {t:%a %H:%M} 觸發"
        if weekday is not None:
            assert t.isoweekday() % 7 == weekday, f"{name} 在台北 {t:%a %H:%M} 觸發"


@pytest.mark.parametrize(
    ("args", "expected"),
    [
        ((0, 6), "0 22 * * *"),  # 台北 06:00 是 UTC 前一天 22:00
        ((0, 18), "0 10 * * *"),
        ((30, 8), "30 0 * * *"),  # 剛好 8 點不跨日
        ((0, 4, 1), "0 20 * * 0"),  # 週一 04:00 是 UTC 週日 20:00
        ((0, 4, 0), "0 20 * * 6"),  # 週日往前是週六
        ((0, 12, 1), "0 4 * * 1"),
    ],
)
def test_taipei_to_utc(args, expected):
    from app.jobs.cron_config import taipei

    assert taipei(*args) == expected
