"""抓取的 worker 啟動時補抓（規格書 5.6）：今天還沒成功抓過的資料，就把工作排進「抓取」佇列。

`python -m app.jobs.startup`，在 `worker-crawl` 的 `rq worker` 之前執行。
資料庫或 Redis 還沒好時只記警告，不擋 worker。
"""

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from rq import Queue
from sqlalchemy import text

from app.config import get_settings
from app.db import sync_session
from app.jobs.refresh import refresh_atmovies_job, refresh_osm_job, refresh_stations_job
from app.redis_client import rq_redis

log = logging.getLogger(__name__)
TZ = ZoneInfo("Asia/Taipei")

# (crawl_runs.job, 多久沒成功就補抓, 工作)
CHECKS = [
    ("tdx_stations", timedelta(days=7), refresh_stations_job),
    ("atmovies", None, refresh_atmovies_job),  # None：今天還沒成功過
    ("osm", None, refresh_osm_job),
]


def due(last_success: datetime | None, max_age: timedelta | None, now: datetime) -> bool:
    if last_success is None:
        return True
    last = last_success.astimezone(TZ)
    if max_age is None:
        return last.date() < now.date()
    return now - last >= max_age


def main() -> list[str]:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    now = datetime.now(TZ)
    queued = []
    try:
        with sync_session()() as session:
            last = dict(
                session.execute(
                    text(
                        "SELECT job, max(finished_at) FROM crawl_runs "
                        "WHERE status = 'success' AND NOT (stats ? 'demo') GROUP BY job"
                    )
                ).all()
            )
        q = Queue("crawl", connection=rq_redis())
        for job, max_age, func in CHECKS:
            if due(last.get(job), max_age, now):
                q.enqueue(func, job_timeout=get_settings().crawl_timeout_seconds)
                queued.append(job)
    except Exception as exc:  # noqa: BLE001
        log.warning("啟動時補抓失敗，略過：%r", exc)
    log.info("啟動時補抓：%s", queued or "不需要")
    return queued


if __name__ == "__main__":
    main()
