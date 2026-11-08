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


# ── 第三條出口：Jev 沒有結果、LLM 失敗或棄權時的紀錄 ─────────────────────────

UNIFORM = ChoiceAnswer({"r1": 1 / 3, "r2": 1 / 3, "r3": 1 / 3})


def test_jev_unavailable_and_llm_failed_is_not_decided_by_jev():
    # Jev 每月額度用完：planner 給均等機率，LLM 又逾時，pick.code 只是排序最前面的代碼
    pick = LlmPick("r1", False, status="timeout", latency_ms=30000.0, model="m")
    r = record_decision(QUESTION, UNIFORM, POLICY, pick, None, jev_unavailable=True)
    assert (r.chosen, r.decided_by, r.fallback_reason) == ("r1", "fallback", "jev_unavailable")


def test_jev_unavailable_but_llm_answered_is_decided_by_llm():
    pick = LlmPick("r2", True, status="ok", latency_ms=900.0, model="m")
    r = record_decision(QUESTION, UNIFORM, POLICY, pick, None, jev_unavailable=True)
    assert (r.chosen, r.decided_by, r.fallback_reason) == ("r2", "llm", None)


def test_jev_unavailable_without_asking_llm_is_fallback():
    # 例如 margin 0 的判斷方式：均等機率也算有把握，沒有問 LLM
    r = record_decision(QUESTION, UNIFORM, RouterPolicy("margin", 0.0), None, None,
                        jev_unavailable=True)  # fmt: skip
    assert (r.chosen, r.decided_by, r.fallback_reason) == ("r1", "fallback", "jev_unavailable")


def test_llm_failure_with_jev_records_reason_and_keeps_jev():
    for status in ("timeout", "circuit_open", "abstain", "not_candidate"):
        pick = LlmPick("r1", False, status=status, latency_ms=None, model="m")
        r = record_decision(QUESTION, UNSURE, POLICY, pick, JEV)
        assert (r.chosen, r.decided_by, r.fallback_reason) == ("r1", "jev", f"llm_{status}")


def test_llm_failure_without_status_records_unknown():
    r = record_decision(QUESTION, UNSURE, POLICY, LlmPick("r1", False), JEV)
    assert (r.decided_by, r.fallback_reason) == ("jev", "llm_unknown")


def test_normal_paths_have_no_fallback_reason():
    assert record_decision(QUESTION, SURE, POLICY, None, JEV).fallback_reason is None
    ok = LlmPick("r2", True, status="ok", latency_ms=1.0, model="m")
    assert record_decision(QUESTION, UNSURE, POLICY, ok, JEV).fallback_reason is None
    assert record_decision(QUESTION, ChoiceAnswer({}), POLICY, None).fallback_reason is None


def test_disabled_llm_with_jev_is_recorded_as_llm_disabled():
    # LLM_MODE=mock：沒有呼叫 LLM，採用 Jev 第一名
    r = record_decision(QUESTION, UNSURE, POLICY, LlmPick("r1", False, "disabled"), JEV)
    assert (r.decided_by, r.fallback_reason) == ("jev", "llm_disabled")


def test_summary_counts_fallback_only_when_present():
    records = [
        record_decision(QUESTION, SURE, POLICY, None, JEV),
        record_decision(
            QUESTION, UNIFORM, POLICY, LlmPick("r1", False, "timeout"), None, jev_unavailable=True
        ),  # fmt: skip
    ]
    assert summarize(records)["decided_by_fallback"] == 1
    assert "decided_by_fallback" not in summarize(records[:1])


def test_planner_records_fallback_when_jev_quota_is_used_up():
    """planner._decide 在額度用完（_jev_result 是 None）時要把它傳給紀錄層。"""
    from types import SimpleNamespace

    from app.planner import Planner

    class TimeoutLlm:
        def pick(self, question, probs):
            return LlmPick(sorted(probs)[0], False, "timeout", 30000.0, "m")

    p = Planner.__new__(Planner)
    p.policy, p.decisions, p._jev_result, p.job_id = POLICY, [], None, "job-unit"
    p._jev_unavailable = True  # _ask_jev 在每月額度用完時設的
    p.progress = lambda stage, **data: None
    p.d = SimpleNamespace(llm=TimeoutLlm())
    assert p._decide(QUESTION, UNIFORM) == ("r1", False)
    [rec] = p.decisions
    assert (rec.decided_by, rec.fallback_reason) == ("fallback", "jev_unavailable")

    p.decisions, p._jev_result, p._jev_unavailable = [], JEV, False
    p._decide(QUESTION, UNIFORM)
    assert (p.decisions[0].decided_by, p.decisions[0].fallback_reason) == ("jev", "llm_timeout")


def test_jev_unavailable_with_single_option_is_decided_by_jev():
    # 只有一個選項就沒有選擇的空間：額度用完也不算 fallback
    single = ChoiceQuestion(
        id="restaurant", instructions="選一家", options=[Option("r1", "餐廳 1", {})]
    )
    r = record_decision(single, ChoiceAnswer({"r1": 1.0}), POLICY, None, None, jev_unavailable=True)
    assert (r.chosen, r.decided_by, r.fallback_reason) == ("r1", "jev", None)
