"""決策紀錄寫進 decision_records（不需要資料庫：session 用假物件）。

真的寫進 PostgreSQL 的測試在 tests/integration/test_decision_records.py。
"""

import logging
from types import SimpleNamespace

import pytest

from app.config import Settings
from app.jev.base import ChoiceAnswer, JevResult
from app.llm import LlmPick
from app.models import DecisionRecordRow
from app.planner import PlanError, Planner
from app.planning.choose import ChoiceQuestion, Option, RouterPolicy

QUESTION = ChoiceQuestion(
    id="restaurant",
    instructions="選一家最適合的餐廳",
    options=[Option("r1", "餐廳 1", {}), Option("r2", "餐廳 2", {}), Option("r3", "餐廳 3", {})],
)
SURE = ChoiceAnswer({"r1": 0.8, "r2": 0.15, "r3": 0.05})
UNIFORM = ChoiceAnswer({"r1": 1 / 3, "r2": 1 / 3, "r3": 1 / 3})
JEV = JevResult(answers={}, model="jev-1.14.0", input_tokens=120, latency_ms=830.5, attempts=2)


class FakeSession:
    def __init__(self, fail_on: str | None = None):
        self.fail_on, self.added, self.calls = fail_on, [], []

    def _call(self, name: str) -> None:
        self.calls.append(name)
        if name == self.fail_on:
            raise RuntimeError(f"{name} 失敗")

    def rollback(self):
        self._call("rollback")

    def add_all(self, rows):
        self._call("add_all")
        self.added.extend(rows)

    def commit(self):
        self._call("commit")


class FixedLlm:
    def __init__(self, pick: LlmPick):
        self.picked = pick

    def pick(self, question, probs):
        return self.picked


def planner(session, enabled: bool = True, llm=None) -> Planner:
    """不經過 __init__，只放 _decide 和紀錄用到的欄位。"""
    p = Planner.__new__(Planner)
    p.policy = RouterPolicy()
    p.decisions, p._jev_result, p.job_id = [], JEV, "job-db"
    p.progress = lambda stage, **data: None
    p.s = Settings(_env_file=None, decision_trace_db=enabled)
    p.d = SimpleNamespace(
        session=session, llm=llm or FixedLlm(LlmPick("r2", True, "ok", 1500.0, "qwen2.5:3b"))
    )
    return p


def test_default_is_enabled(monkeypatch):
    monkeypatch.delenv("DECISION_TRACE_DB", raising=False)
    assert Settings(_env_file=None).decision_trace_db is True


def test_rows_match_decision_records():
    session = FakeSession()
    p = planner(session)
    p._decide(QUESTION, SURE)
    p._decide(QUESTION, UNIFORM)
    p._run = lambda: {"plans": ["ok"]}
    assert p.run() == {"plans": ["ok"]}
    assert session.calls == ["rollback", "add_all", "commit"]
    assert all(isinstance(row, DecisionRecordRow) for row in session.added)
    columns = set(DecisionRecordRow.__table__.columns.keys())
    for row, record in zip(session.added, p.decisions, strict=True):
        fields = record.to_dict()
        # DecisionRecord 的每個欄位都有對應的欄
        assert set(fields) <= columns
        assert {name: getattr(row, name) for name in fields} == fields
        assert row.job_id == "job-db"
    sure, unsure = session.added
    assert (sure.decided_by, sure.llm_status, sure.jev_model) == ("jev", None, "jev-1.14.0")
    assert (unsure.decided_by, unsure.chosen, unsure.llm_latency_ms) == ("llm", "r2", 1500.0)


def test_rows_are_saved_even_when_planning_fails():
    session = FakeSession()
    p = planner(session)

    def failing_run():
        p._decide(QUESTION, UNIFORM)
        raise PlanError("NO_FEASIBLE", "查到的精確路線都接不上")

    p._run = failing_run
    with pytest.raises(PlanError):
        p.run()
    assert [row.chosen for row in session.added] == ["r2"]


@pytest.mark.parametrize("fail_on", ["rollback", "add_all", "commit"])
def test_db_failure_does_not_break_planning(fail_on, caplog):
    caplog.set_level(logging.INFO, logger="app.planner")
    p = planner(FakeSession(fail_on))
    p._decide(QUESTION, UNIFORM)
    p._run = lambda: {"plans": ["ok"]}
    assert p.run() == {"plans": ["ok"]}
    messages = [r.getMessage() for r in caplog.records]
    assert any("決策紀錄寫不進資料庫" in m for m in messages)
    # 日誌那一行照常輸出
    assert any(m.startswith("decision_trace ") for m in messages)


def test_db_failure_does_not_hide_planning_error():
    p = planner(FakeSession("commit"))

    def failing_run():
        p._decide(QUESTION, UNIFORM)
        raise PlanError("NO_FEASIBLE", "查到的精確路線都接不上")

    p._run = failing_run
    with pytest.raises(PlanError) as exc:
        p.run()
    assert exc.value.code == "NO_FEASIBLE"


def test_failed_write_is_rolled_back():
    session = FakeSession("commit")
    p = planner(session)
    p._decide(QUESTION, SURE)
    p._run = lambda: {}
    p.run()
    assert session.calls == ["rollback", "add_all", "commit", "rollback"]


def test_disabled_does_not_touch_session(caplog):
    caplog.set_level(logging.INFO, logger="app.planner")
    session = FakeSession()
    p = planner(session, enabled=False)
    p._decide(QUESTION, UNIFORM)
    p._run = lambda: {"plans": ["ok"]}
    assert p.run() == {"plans": ["ok"]}
    assert session.calls == []
    assert any(r.getMessage().startswith("decision_trace ") for r in caplog.records)


def test_no_decisions_no_write():
    session = FakeSession()
    p = planner(session)
    p._run = lambda: {"plans": []}
    p.run()
    assert session.calls == []
