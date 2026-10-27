"""把請求的日期和 HH:MM 換成帶時區的時間（規格書 6.4）。

- `earliest_departure` 一律是 `date` 當天
- `latest_home` 早於 06:00 算隔天，最晚到隔天 02:00；其他時間算當天，要晚於最早出門【預設】
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Taipei")


def resolve_times(
    day: date, earliest: time, latest: time, cutoff_hour: int = 6, max_hour_next_day: int = 2
) -> tuple[datetime, datetime]:
    """`cutoff_hour`、`max_hour_next_day` 是設定的 `latest_home_cutoff_hour`、
    `latest_home_max_hour_next_day`（預設 06:00、02:00）。"""
    earliest_dt = datetime.combine(day, earliest, TZ)
    if latest < time(cutoff_hour):
        if latest > time(max_hour_next_day):
            raise ValueError(f"最晚到家可以跨到隔天，但不能晚於 {max_hour_next_day:02d}:00")
        latest_dt = datetime.combine(day + timedelta(days=1), latest, TZ)
    else:
        latest_dt = datetime.combine(day, latest, TZ)
    if latest_dt <= earliest_dt:
        raise ValueError("最晚到家要晚於最早出門")
    return earliest_dt, latest_dt
