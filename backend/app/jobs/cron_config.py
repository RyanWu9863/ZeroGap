"""`rq cron` 的排程（規格書 5.6）：`rq cron app.jobs.cron_config`

rq 一律用 UTC 的現在時間算下一次觸發，容器的 `TZ` 沒有作用（2026-10-27 審查發現：
原本寫 `0 6 * * *` 實際在台北 14:00 跑）。所以時間照台北寫，用 `taipei()` 換成 UTC 的 cron 字串。
每個工作開始時會先搶 `lock:job:{名稱}`，就算 cron 重複觸發也只會跑一次。
"""

from rq import cron

from app.config import get_settings
from app.jobs.refresh import (
    geocode_hubs_job,
    refresh_atmovies_job,
    refresh_google_geom_job,
    refresh_google_places_job,
    refresh_osm_job,
    refresh_stations_job,
)

TIMEOUT = get_settings().crawl_timeout_seconds
UTC_OFFSET_HOURS = 8  # 台灣沒有日光節約時間，一年都是 UTC+8


def taipei(minute: int, hour: int, weekday: int | None = None) -> str:
    """台北時間換成 UTC 的 cron 字串。`weekday` 是 0（週日）～6，None 是每天。

    台北 08:00 前在 UTC 是前一天，每週的工作要跟著往前一天，例如週一 04:00 → 週日 20:00。
    """
    utc_hour = hour - UTC_OFFSET_HOURS
    day_shift = -1 if utc_hour < 0 else 0
    dow = "*" if weekday is None else str((weekday + day_shift) % 7)
    return f"{minute} {utc_hour % 24} * * {dow}"


# 開眼只有 2～3 天的場次，早晚各抓一次（2026-10-20 決定）
cron.register(refresh_atmovies_job, queue_name="crawl", cron=taipei(0, 6), job_timeout=TIMEOUT,
              name="atmovies-morning")  # fmt: skip
cron.register(refresh_atmovies_job, queue_name="crawl", cron=taipei(0, 18), job_timeout=TIMEOUT,
              name="atmovies-evening")  # fmt: skip
cron.register(refresh_osm_job, queue_name="crawl", cron=taipei(30, 6), job_timeout=TIMEOUT,
              name="osm")  # fmt: skip
cron.register(refresh_stations_job, queue_name="crawl", cron=taipei(0, 4, 1), job_timeout=TIMEOUT,
              name="tdx-stations")  # fmt: skip
cron.register(geocode_hubs_job, queue_name="crawl", cron=taipei(30, 4, 1), job_timeout=TIMEOUT,
              name="hubs")  # fmt: skip
# Google：GOOGLE_MODE=mock 時工作會直接跳過（5.6）
cron.register(refresh_google_places_job, queue_name="crawl", cron=taipei(0, 5, 1),
              job_timeout=TIMEOUT, name="google-places")  # fmt: skip
cron.register(refresh_google_geom_job, queue_name="crawl", cron=taipei(0, 3), job_timeout=TIMEOUT,
              name="google-geom")  # fmt: skip
