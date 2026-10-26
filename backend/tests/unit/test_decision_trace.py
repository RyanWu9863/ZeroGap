"""決策紀錄：內容正確、可以轉成 JSON、不帶使用者偏好和選項名稱。"""

import json

from app.decision_trace import record_decision, summarize
from app.jev.base import ChoiceAnswer, JevResult
from app.llm import LlmPick
from app.planning.choose import ChoiceQuestion, Option, RouterPolicy

QUESTION = ChoiceQuestion(
    id="restaurant",
    instructions="選一家最適合的餐廳",
    options=[
        Option("r1", "秘密小館", {"cuisine": "japanese"}),
        Option("r2", "餐廳 2", {"cuisine": "western"}),
        Option("r3", "餐廳 3", {"cuisine": "chinese"}),
    ],
    state={"cuisine": "japanese", "budget_per_person": 1234},
)
SURE = ChoiceAnswer({"r1": 0.8, "r2": 0.15, "r3": 0.05}, confidence=0.8)
UNSURE = ChoiceAnswer({"r1": 0.45, "r2": 0.35, "r3": 0.20})
JEV = JevResult(answers={}, model="jev-1.14.0", input_tokens=120, latency_ms=830.5, attempts=2)
POLICY = RouterPolicy()


def test_sure_answer_is_decided_by_jev_without_llm():
    r = record_decision(QUESTION, SURE, POLICY, None, JEV)
    assert (r.unsure, r.jev_top, r.chosen, r.decided_by) == (False, "r1", "r1", "jev")
    assert r.llm_status is None and r.llm_latency_ms is None
    assert (r.k, r.policy, r.p_top) == (3, "fixed:0.6", 0.8)
    assert (r.jev_model, r.jev_latency_ms, r.jev_attempts) == ("jev-1.14.0", 830.5, 2)


def test_unsure_answer_picked_by_llm():
    pick = LlmPick("r2", True, status="ok", latency_ms=1820.0, model="qwen2.5:3b")
    r = record_decision(QUESTION, UNSURE, POLICY, pick, JEV)
    assert (r.unsure, r.jev_top, r.chosen, r.decided_by) == (True, "r1", "r2", "llm")
    assert (r.llm_status, r.llm_latency_ms, r.llm_model) == ("ok", 1820.0, "qwen2.5:3b")


def test_llm_failure_keeps_jev_choice_and_records_why():
    pick = LlmPick("r1", False, status="timeout", latency_ms=30000.0, model="qwen2.5:3b")
    r = record_decision(QUESTION, UNSURE, POLICY, pick)
    assert (r.chosen, r.decided_by, r.llm_status) == ("r1", "jev", "timeout")
    assert r.jev_model is None  # 沒給 JevResult


def test_other_policy_is_recorded():
    r = record_decision(QUESTION, UNSURE, RouterPolicy("margin", 0.05), None)
    assert r.policy == "margin:0.05"
    assert r.unsure is False  # 差距 0.10 ≥ 0.05


def test_record_has_no_user_preferences_or_names():
    pick = LlmPick("r2", True, status="ok", latency_ms=10.0, model="m")
    text = json.dumps(record_decision(QUESTION, UNSURE, POLICY, pick, JEV).to_dict(),
                      ensure_ascii=False)  # fmt: skip
    for secret in ("秘密小館", "japanese", "1234", "選一家最適合的餐廳"):
        assert secret not in text


def test_empty_answer_does_not_crash():
    r = record_decision(QUESTION, ChoiceAnswer({}), POLICY, None)
    assert (r.k, r.p_top, r.jev_top, r.chosen, r.unsure) == (0, None, None, None, False)


def test_summary():
    records = [
        record_decision(QUESTION, SURE, POLICY, None),
        record_decision(QUESTION, UNSURE, POLICY, LlmPick("r2", True, "ok", 1000.0, "m")),
        record_decision(QUESTION, UNSURE, POLICY, LlmPick("r1", False, "timeout", 30000.0, "m")),
        record_decision(QUESTION, UNSURE, POLICY, LlmPick("r1", False, "circuit_open", None, "m")),
    ]
    assert summarize(records) == {
        "questions": 4,
        "unsure": 3,
        "decided_by_llm": 1,
        "llm_status": {"ok": 1, "timeout": 1, "circuit_open": 1},
        "llm_latency_ms_total": 31000.0,
    }
