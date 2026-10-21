"""抓取工作的共用外殼（規格書 5.4、5.6、4.3 `crawl_runs`）。

每個工作先搶 `lock:job:{名稱}`，沒搶到就跳過；開始時寫一筆 `crawl_runs`（running），
結束時改成 success 或 failed，`stats` 存工作回傳的統計。
"""

import logging
import traceback
from collections.abc import Callable
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import redis
from sqlalchemy.orm import Session

from app.models import CrawlRun
from app.redis_utils.lock import Lock

log = logging.getLogger(__name__)
TZ = ZoneInfo("Asia/Taipei")


def run_crawl(
    session: Session,
    r: redis.Redis,
    lock_name: str,
    job: str,
    work: Callable[[Callable[[], None]], dict[str, Any]],
) -> dict[str, Any] | None:
    """`work(keep_alive)` 做實際的事，回傳統計；長時間的工作要定期呼叫 `keep_alive()` 延長鎖。

    沒搶到鎖回傳 None。`job` 是 `crawl_runs.job` 的名稱，狀態列也用它（例如 `tdx_stations`）。
    """
    with Lock(r, f"job:{lock_name}") as lock:
        if not lock.acquired:
            log.info("工作 %s 已經有人在跑，跳過", lock_name)
            return None
        run = CrawlRun(job=job, status="running", started_at=datetime.now(TZ))
        session.add(run)
        session.commit()
        try:
            stats = work(lock.extend)
        except Exception as exc:
            session.rollback()
            run.status = "failed"
            run.error = "".join(traceback.format_exception_only(exc)).strip()[:2000]
            run.finished_at = datetime.now(TZ)
            session.commit()
            raise
        run.status = "success"
        run.stats = stats
        run.finished_at = datetime.now(TZ)
        session.commit()
        return stats
