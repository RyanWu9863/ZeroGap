"""RQ 的規劃工作（規格書 5.6、5.7）：在 worker 裡執行規劃，進度和結果 PUBLISH 到 Pub/Sub。

事件格式：`{"event": "queued"|"progress"|"result"|"error", "data": {...}}`。
結果只透過 Pub/Sub 傳一次，不寫進 Redis 的任何 key。
"""

import json
import logging
import sys
from typing import Any

from rq import get_current_job
from rq.timeouts import JobTimeoutException

from app.clients import make_jev, make_llm, make_places, make_transit
from app.config import get_settings
from app.db import sync_session
from app.jev.client import JevError
from app.planner import Deps, PlanError, run_plan
from app.redis_client import sync_redis
from app.schemas import ErrorBody, PlanRequest, PlanResult
from app.tdx import TdxError, TdxQuotaExhausted

log = logging.getLogger(__name__)


def channel(job_id: str) -> str:
    return f"plan:{job_id}:events"


def encode(event: str, data: dict[str, Any]) -> str:
    return json.dumps({"event": event, "data": data}, ensure_ascii=False, default=str)


def setup_planner_logging() -> None:
    """讓 worker 印出決策紀錄（app.planner 的 INFO，規格書 7.1）。

    `rq worker` 只設定 rq.worker 這個 logger，app.planner 沿用 Python 預設的 WARNING，
    決策紀錄那一行會被丟掉（2026-10-26 用 compose 確認）。只開 app.planner，其他 app.* 照舊。

    每個工作開始時呼叫：rq 預設每個工作 fork 一個 work horse，worker 本身不會跑到這裡，
    所以每個 work horse 都從沒有 handler 開始、只加一次。不 fork 的 worker 同一個程序會跑很多
    個工作；往上已經有 handler（自己加過的，或外面設定過 logging，例如 pytest）就不再加。
    """
    planner_log = logging.getLogger("app.planner")
    if planner_log.hasHandlers():
        return
    handler = logging.StreamHandler(sys.stdout)
    fmt = "%(asctime)s %(levelname)s %(name)s[%(process)d]: %(message)s"
    handler.setFormatter(logging.Formatter(fmt, "%H:%M:%S"))
    planner_log.addHandler(handler)
    planner_log.setLevel(logging.INFO)


def plan_job(request: dict[str, Any]) -> None:
    setup_planner_logging()
    job = get_current_job()
    job_id = job.id if job else "local"
    r = sync_redis()

    def publish(event: str, data: dict[str, Any]) -> None:
        r.publish(channel(job_id), encode(event, data))

    def progress(stage: str, **data: Any) -> None:
        publish("progress", {"stage": stage, **data})

    def error(code: str, message: str, reasons: dict[str, int] | None = None) -> None:
        body = ErrorBody(code=code, message=message, reasons=reasons)
        publish("error", body.model_dump(exclude_none=True))

    settings = get_settings()
    try:
        req = PlanRequest.model_validate(request)
        with sync_session()() as session:
            deps = Deps(
                session=session,
                redis=r,
                transit=make_transit(settings, r),
                jev=make_jev(settings),
                llm=make_llm(settings),
                places=make_places(settings),
                settings=settings,
            )
            result = run_plan(req, job_id, deps, progress)
        publish("result", PlanResult.model_validate(result).to_json())
    except PlanError as exc:
        error(exc.code, exc.message, exc.reasons)
    except (TdxError, TdxQuotaExhausted) as exc:
        log.warning("規劃工作 %s：TDX 出錯 %s", job_id, exc)
        error("UPSTREAM_ERROR", "交通查詢暫時無法使用，請稍後再試")
    except JevError as exc:
        log.warning("規劃工作 %s：Jev 出錯 %s", job_id, exc)
        error("UPSTREAM_ERROR", "Jev 暫時無法使用，請稍後再試")
    except JobTimeoutException:
        error("TIMEOUT", "規劃超過時間上限，請再試一次")
    except Exception:
        log.exception("規劃工作 %s 失敗", job_id)
        error("INTERNAL_ERROR", "規劃時發生錯誤，請再試一次")
