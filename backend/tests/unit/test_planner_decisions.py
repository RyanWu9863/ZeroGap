"""planner 的決策判斷和決策紀錄（不需要資料庫：只測 _decide、run 的紀錄和設定）。

完整的規劃流程在 tests/integration/test_planner_trace.py。
"""

import json
import logging
from types import SimpleNamespace

import pytest

from app.config import Settings
from app.jev.base import ChoiceAnswer
from app.llm import LlmPick
from app.planner import PlanError, Planner, router_policy
from app.planning.choose import ChoiceQuestion, Option, RouterPolicy

QUESTION = ChoiceQuestion(
    id="restaurant",
    instructions="選一家最適合的餐廳",
    options=[Option("r1", "餐廳 1", {}), Option("r2", "餐廳 2", {}), Option("r3", "餐廳 3", {})],
)
SURE = ChoiceAnswer({"r1": 0.8, "r2": 0.15, "r3": 0.05})
UNIFORM = ChoiceAnswer({"r1": 1 / 3, "r2": 1 / 3, "r3": 1 / 3})


class RecordingLlm:
    def __init__(self, pick: LlmPick):
        self.picked, self.calls = pick, 0

    def pick(self, question, probs):
        self.calls += 1
        return self.picked


def bare_planner(llm, policy: RouterPolicy | None = None) -> Planner:
    """不經過 __init__（它要資料庫和 TDX），只放 _decide 和紀錄用到的欄位。"""
    p = Planner.__new__(Planner)
    p.policy = policy or RouterPolicy()
    p.decisions, p._jev_result, p.job_id = [], None, "job-unit"
    p.stages = []
    p.progress = lambda stage, **data: p.stages.append(stage)
    p.d = SimpleNamespace(llm=llm)
    return p


def test_sure_answer_does_not_ask_llm():
    llm = RecordingLlm(LlmPick("r2", True, "ok"))
    p = bare_planner(llm)
    assert p._decide(QUESTION, SURE) == ("r1", False)
    assert llm.calls == 0 and "llm_fallback" not in p.stages
    [rec] = p.decisions
    assert (rec.question_id, rec.unsure, rec.decided_by, rec.llm_status) == (
        "restaurant", False, "jev", None,
    )  # fmt: skip


def test_unsure_answer_asks_llm_and_records_status():
    llm = RecordingLlm(LlmPick("r2", True, "ok", 1500.0, "qwen2.5:3b"))
    p = bare_planner(llm)
    assert p._decide(QUESTION, UNIFORM) == ("r2", True)
    assert llm.calls == 1 and p.stages == ["llm_fallback"]
    [rec] = p.decisions
    assert (rec.unsure, rec.decided_by, rec.llm_status, rec.llm_latency_ms) == (
        True, "llm", "ok", 1500.0,
    )  # fmt: skip


def test_llm_failure_keeps_jev_choice():
    p = bare_planner(RecordingLlm(LlmPick("r1", False, "timeout", 30000.0, "qwen2.5:3b")))
    assert p._decide(QUESTION, UNIFORM) == ("r1", False)
    assert p.decisions[0].llm_status == "timeout"


def test_policy_is_used_for_decide_and_unsure():
    # margin 0：第一名和第二名一樣也算有把握，均等機率不會交給 LLM
    llm = RecordingLlm(LlmPick("r2", True, "ok"))
    p = bare_planner(llm, RouterPolicy("margin", 0.0))
    assert p._unsure(UNIFORM) is False
    assert p._decide(QUESTION, UNIFORM) == ("r1", False)
    assert llm.calls == 0


def test_run_logs_trace_even_when_planning_fails(caplog):
    p = bare_planner(RecordingLlm(LlmPick("r2", True, "ok")))

    def failing_run():
        p._decide(QUESTION, UNIFORM)
        raise PlanError("NO_FEASIBLE", "查到的精確路線都接不上")

    p._run = failing_run
    caplog.set_level(logging.INFO, logger="app.planner")
    with pytest.raises(PlanError):
        p.run()
    messages = [r.getMessage() for r in caplog.records]
    [line] = [m for m in messages if m.startswith("decision_trace ")]
    trace = json.loads(line.removeprefix("decision_trace "))
    assert trace["job_id"] == "job-unit"
    assert trace["questions"] == 1 and trace["decided_by_llm"] == 1
    assert trace["decisions"][0]["chosen"] == "r2"


def test_no_decisions_no_log(caplog):
    p = bare_planner(RecordingLlm(LlmPick("r2", True, "ok")))
    p._run = lambda: {"plans": []}
    caplog.set_level(logging.INFO, logger="app.planner")
    assert p.run() == {"plans": []}
    assert not [r for r in caplog.records if r.getMessage().startswith("decision_trace")]


def test_trace_failure_does_not_break_planning(caplog):
    p = bare_planner(RecordingLlm(LlmPick("r2", True, "ok")))
    p.decisions = [object()]  # 壞掉的紀錄
    p._run = lambda: {"plans": ["ok"]}
    assert p.run() == {"plans": ["ok"]}
    assert any("決策紀錄寫不出來" in r.getMessage() for r in caplog.records)


def test_router_policy_from_settings(monkeypatch):
    for name in ("ROUTER_POLICY", "ROUTER_PARAM", "JEV_MIN_TOP_PROBABILITY"):
        monkeypatch.delenv(name, raising=False)
    assert router_policy(Settings(_env_file=None)) == RouterPolicy("fixed", 0.6)
    assert router_policy(Settings(_env_file=None, jev_min_top_probability=0.7)) == RouterPolicy(
        "fixed", 0.7
    )
    custom = Settings(_env_file=None, router_policy="margin", router_param=0.1)
    assert router_policy(custom) == RouterPolicy("margin", 0.1)
