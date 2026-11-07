"""規劃佇列：排隊上限、排隊順位、取消（規格書 5.6、6.4）。API 這一端用。"""

from typing import Any

import redis
from rq import Queue
from rq.command import send_stop_job_command
from rq.exceptions import InvalidJobOperation, NoSuchJobError
from rq.job import Job, JobStatus

from app import tracing
from app.config import Settings

PLANS = "plans"
PLAN_JOB = "app.jobs.plan_job.plan_job"
TRACE_META = "otel"  # job.meta 裡放 trace context 的 key


class QueueFull(Exception):
    pass


def plans_queue(conn: redis.Redis) -> Queue:
    return Queue(PLANS, connection=conn)


def enqueue_plan(conn: redis.Redis, job_id: str, request: dict[str, Any], s: Settings) -> Job:
    """排進「規劃」佇列。呼叫前要先訂閱 `plan:{job_id}:events`（5.7）。

    已經有 5 個在等就丟 QueueFull；在佇列裡超過 15 分鐘還沒開始就作廢（RQ 的 ttl）。
    """
    q = plans_queue(conn)
    if q.count >= s.plan_queue_max_waiting:
        raise QueueFull
    extra: dict[str, Any] = {}
    # 追蹤開啟時，把目前的 trace context（W3C traceparent）放進 job 的 meta，worker 接著用；
    # 關閉時是空的，排進佇列的內容和以前完全相同
    carrier = tracing.inject()
    if carrier:
        extra["meta"] = {TRACE_META: carrier}
    return q.enqueue(
        PLAN_JOB,
        request,
        job_id=job_id,
        job_timeout=s.plan_timeout_seconds,
        ttl=s.plan_queue_ttl_seconds,
        result_ttl=0,  # 結果走 Pub/Sub，不存
        failure_ttl=3600,
        **extra,
    )


def queue_position(conn: redis.Redis, job_id: str) -> int | None:
    """1 代表下一個就輪到；已經開始或不在佇列裡回傳 None。"""
    index = plans_queue(conn).get_job_position(job_id)
    return None if index is None else index + 1


def job_status(conn: redis.Redis, job_id: str) -> JobStatus | None:
    try:
        return Job.fetch(job_id, connection=conn).get_status()
    except NoSuchJobError:
        return None


def cancel_plan(conn: redis.Redis, job_id: str) -> None:
    """使用者斷線：排隊中的直接移除，執行中的讓 worker 停下來。"""
    try:
        job = Job.fetch(job_id, connection=conn)
    except NoSuchJobError:
        return
    status = job.get_status()
    if status == JobStatus.QUEUED:
        job.cancel()
        job.delete()
    elif status == JobStatus.STARTED:
        try:
            send_stop_job_command(conn, job_id)
        except InvalidJobOperation:
            pass
