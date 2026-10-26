"""worker 實際的 logging 設定下，每個規劃工作要剛好印一行決策紀錄（規格書 7.1）。

`rq worker` 只設定 rq.worker 這個 logger，app.planner 的 INFO 原本會被丟掉
（2026-10-26 用 compose 啟動的 worker 確認）。test_planner_trace.py 用 caplog 直接把層級
設成 INFO，抓不到這個問題；這裡另開一個乾淨的程序，照 rq CLI 的方式設定 logging。
"""

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest
import redis

from tests.integration.conftest import reseed
from tests.integration.test_plan_job import DAY, body

BACKEND = Path(__file__).resolve().parents[2]

# 和 `rq worker` 的 CLI 相同，只設定 rq.worker；再在同一個程序裡跑 N 個規劃工作
# （和不 fork 的 SimpleWorker 一樣，同一個程序會跑很多個工作）
WORKER = textwrap.dedent(
    """
    import json, sys
    from rq.logutils import setup_loghandlers
    setup_loghandlers("INFO")
    from app.jobs.plan_job import plan_job
    for _ in range(int(sys.argv[2])):
        plan_job(json.loads(sys.argv[1]))
    """
)


@pytest.fixture
def worker_env(db_url, redis_url, engine):
    reseed(engine, DAY)
    r = redis.Redis.from_url(redis_url)
    r.flushdb()
    yield {
        **os.environ,
        "DATABASE_URL": db_url,
        "REDIS_URL": redis_url,
        "LLM_MODE": "mock",
        "TDX_PER_MINUTE": "1000",
        "PYTHONIOENCODING": "utf-8",
    }
    r.flushdb()


def run_jobs(env, engine, jobs: int) -> list[str]:
    proc = subprocess.run(
        [sys.executable, "-c", WORKER, json.dumps(body(engine)), str(jobs)],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )
    assert proc.returncode == 0, proc.stderr
    return [line for line in (proc.stdout + proc.stderr).splitlines() if "decision_trace " in line]


def test_job_prints_one_decision_trace(worker_env, engine):
    [line] = run_jobs(worker_env, engine, 1)
    trace = json.loads(line.split("decision_trace ", 1)[1])
    assert trace["job_id"] == "local"  # 不在 rq 裡跑時，plan_job 用的 job_id
    assert trace["questions"] == len(trace["decisions"]) > 0


def test_two_jobs_in_one_process_print_one_line_each(worker_env, engine):
    # 同一個程序跑第二個工作時不能再加一次 handler，不然第二個工作會印兩行
    assert len(run_jobs(worker_env, engine, 2)) == 2
