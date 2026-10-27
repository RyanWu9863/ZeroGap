"""抓取的 worker 啟動時補抓（規格書 5.6）：今天還沒成功抓過的資料，就把工作排進「抓取」佇列。

`python -m app.jobs.startup`，在 `worker-crawl` 的 `rq worker` 之前執行。
資料庫或 Redis 還沒好時每 5 秒重試，最多 2 分鐘：電腦重開機時 Docker 照 restart 重啟容器，
不會等 depends_on 的 healthcheck，worker 常比 PostgreSQL 先起來（2026-10-27 補抓因此被略過）。
重試完還是不行才記警告略過，不擋 worker。
"""

import logging
import time
from collections.abc import Callable
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


def enqueue_due(now: datetime, queued: list[str]) -> None:
    """把該補抓的排進佇列，排好的加進 `queued`；重試時跳過已經排過的，不會重複排。"""
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
        if job not in queued and due(last.get(job), max_age, now):
            q.enqueue(func, job_timeout=get_settings().crawl_timeout_seconds)
            queued.append(job)


def main(
    attempts: int = 24,
    wait: float = 5.0,
    sleep: Callable[[float], None] = time.sleep,
) -> list[str]:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    queued: list[str] = []
    for attempt in range(1, attempts + 1):
        try:
            enqueue_due(datetime.now(TZ), queued)
            break
        except Exception as exc:  # noqa: BLE001
            if attempt == attempts:
                log.warning("啟動時補抓失敗，略過：%r", exc)
            else:
                log.info(
                    "啟動時補抓：資料庫或 Redis 還沒好（第 %d 次），%g 秒後重試：%r",
                    attempt,
                    wait,
                    exc,
                )
                sleep(wait)
    log.info("啟動時補抓：%s", queued or "不需要")
    return queued


if __name__ == "__main__":
    main()
