"""完整規劃流程裡的決策紀錄和 Router 政策（要 PostgreSQL、Redis）。

示意種子資料 ＋ 模擬版 TDX、Jev、Google，做法和 test_planner.py 相同。
"""

import json
import logging

import pytest
import redis

from app.config import Settings
from app.llm import MockLlm
from app.places import MockPlaces
from app.planner import Deps, run_plan
from app.transit import MockTransit
from tests.integration.conftest import reseed
from tests.integration.test_planner import DAY, SecondPickLlm, UnsureJev, request


@pytest.fixture(scope="module", autouse=True)
def seeded(engine):
    reseed(engine, DAY)


@pytest.fixture
def r(redis_url):
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    client.flushdb()
    yield client
    client.flushdb()


def run(session, r, req, jev, llm, **settings):
    stages = []
    deps = Deps(
        session=session,
        redis=r,
        transit=MockTransit(),
        jev=jev,
        llm=llm,
        places=MockPlaces(),
        settings=Settings(_env_file=None, tdx_per_minute=1000, **settings),
    )
    result = run_plan(req, "job-trace", deps, lambda stage, **data: stages.append((stage, data)))
    return result, stages


def trace_from(caplog) -> dict:
    messages = [r.getMessage() for r in caplog.records]
    [line] = [m for m in messages if m.startswith("decision_trace ")]
    return json.loads(line.removeprefix("decision_trace "))


def test_trace_records_every_question(session, r, caplog):
    caplog.set_level(logging.INFO, logger="app.planner")
    run(session, r, request(session), UnsureJev(), SecondPickLlm())
    trace = trace_from(caplog)
    assert trace["job_id"] == "job-trace"
    decisions = trace["decisions"]
    assert trace["questions"] == len(decisions) >= 2
    # 先選電影、再選餐廳，之後是各組的路線
    assert [d["question_id"] for d in decisions[:2]] == ["movie", "restaurant"]
    for d in decisions[:2]:
        assert d["unsure"] and d["decided_by"] == "llm" and d["policy"] == "fixed:0.6"
    assert all(d["question_id"].startswith("route_") for d in decisions[2:])
    # 均等機率時，有 2 個以上選項的題目都會交給 LLM
    assert all(d["unsure"] == (d["k"] >= 2) for d in decisions)


def test_trace_has_no_user_conditions(session, r, caplog):
    caplog.set_level(logging.INFO, logger="app.planner")
    run(session, r, request(session), UnsureJev(), MockLlm())
    trace = trace_from(caplog)
    assert set(trace) == {
        "job_id", "questions", "unsure", "decided_by_llm", "llm_status",
        "llm_latency_ms_total", "decisions",
    }  # fmt: skip
    for d in trace["decisions"]:
        # 只有代碼、機率特徵、狀態和時間；沒有偏好、店名、題目說明
        assert not {"state", "label", "instructions", "budget_per_person", "cuisine"} & set(d)
        assert d["llm_status"] == "disabled" or d["llm_status"] is None  # MockLlm


def test_router_policy_from_settings(session, r, caplog):
    # margin 0：第一名和第二名一樣也算有把握，所以均等機率也不會交給 LLM
    caplog.set_level(logging.INFO, logger="app.planner")
    result, stages = run(
        session, r, request(session), UnsureJev(), SecondPickLlm(),
        router_policy="margin", router_param=0.0,
    )  # fmt: skip
    assert "llm_fallback" not in [s for s, _ in stages]
    trace = trace_from(caplog)
    assert all(d["policy"] == "margin:0" and not d["unsure"] for d in trace["decisions"])
    assert all(p["decided_by"]["movie"] == "jev" for p in result["plans"])
