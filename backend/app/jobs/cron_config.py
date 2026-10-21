"""`rq cron` 的排程（規格書 5.6）：`rq cron app.jobs.cron_config`

時間依容器的時區計算，所以 `cron` 容器一定要設 `TZ=Asia/Taipei`。
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

# 開眼只有 2～3 天的場次，早晚各抓一次（2026-10-20 決定）
cron.register(refresh_atmovies_job, queue_name="crawl", cron="0 6 * * *", job_timeout=TIMEOUT,
              name="atmovies-morning")  # fmt: skip
cron.register(refresh_atmovies_job, queue_name="crawl", cron="0 18 * * *", job_timeout=TIMEOUT,
              name="atmovies-evening")  # fmt: skip
cron.register(refresh_osm_job, queue_name="crawl", cron="30 6 * * *", job_timeout=TIMEOUT,
              name="osm")  # fmt: skip
cron.register(refresh_stations_job, queue_name="crawl", cron="0 4 * * 1", job_timeout=TIMEOUT,
              name="tdx-stations")  # fmt: skip
cron.register(geocode_hubs_job, queue_name="crawl", cron="30 4 * * 1", job_timeout=TIMEOUT,
              name="hubs")  # fmt: skip
# Google：GOOGLE_MODE=mock 時工作會直接跳過（5.6）
cron.register(refresh_google_places_job, queue_name="crawl", cron="0 5 * * 1",
              job_timeout=TIMEOUT, name="google-places")  # fmt: skip
cron.register(refresh_google_geom_job, queue_name="crawl", cron="0 3 * * *", job_timeout=TIMEOUT,
              name="google-geom")  # fmt: skip
