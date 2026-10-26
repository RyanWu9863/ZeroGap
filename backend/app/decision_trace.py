"""每一題選擇的決策紀錄：Jev 給了什麼機率、Router 怎麼判斷、LLM 有沒有回答、最後選了誰。

planner 目前還沒有呼叫這裡。接上的方式：
    unsure = policy.unsure(answer.probabilities)
    pick = llm.pick(question, answer.probabilities) if unsure else None
    record = record_decision(question, answer, policy, pick, jev_result)

紀錄只放選項代碼、機率、狀態和時間；**不放使用者的偏好、選項名稱、prompt**，可以直接寫進日誌。
"""

from collections import Counter
from dataclasses import asdict, dataclass
from typing import Any, Literal

from app.jev.base import ChoiceAnswer, JevResult
from app.llm import LlmPick
from app.planning.choose import ChoiceQuestion, RouterPolicy, decision_features


@dataclass(frozen=True)
class DecisionRecord:
    question_id: str
    k: int  # 選項數
    policy: str  # 例如 "fixed:0.6"
    p_top: float | None
    margin: float | None
    norm_entropy: float | None
    unsure: bool  # Router 判斷 Jev 沒把握
    jev_top: str | None
    jev_model: str | None
    jev_latency_ms: float | None  # 同一次 Jev 請求可能包含好幾題，這是整次請求的時間
    jev_attempts: int | None
    llm_status: str | None  # None：沒有問 LLM
    llm_latency_ms: float | None
    llm_model: str | None
    chosen: str | None
    decided_by: Literal["jev", "llm"]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def record_decision(
    question: ChoiceQuestion,
    answer: ChoiceAnswer,
    policy: RouterPolicy,
    pick: LlmPick | None,
    jev: JevResult | None = None,
) -> DecisionRecord:
    """`pick` 是 None 表示沒有問 LLM（Jev 有把握）。最後的選擇照 planner 現在的規則：
    有問 LLM 就用 `pick.code`（LLM 失敗時它本身就是 Jev 第一名），沒問就用 Jev 第一名。
    """
    probs = answer.probabilities
    f = decision_features(probs) if probs else None
    jev_top = answer.top if probs else None
    by_llm = bool(pick and pick.used_llm)
    return DecisionRecord(
        question_id=question.id,
        k=len(probs),
        policy=f"{policy.kind}:{policy.param:g}",
        p_top=round(f.p_top, 4) if f else None,
        margin=round(f.margin, 4) if f else None,
        norm_entropy=round(f.norm_entropy, 4) if f else None,
        unsure=policy.unsure(probs),
        jev_top=jev_top,
        jev_model=jev.model if jev else None,
        jev_latency_ms=jev.latency_ms if jev else None,
        jev_attempts=jev.attempts if jev else None,
        llm_status=pick.status if pick else None,
        llm_latency_ms=pick.latency_ms if pick else None,
        llm_model=pick.model if pick else None,
        chosen=pick.code if pick else jev_top,
        decided_by="llm" if by_llm else "jev",
    )


def summarize(records: list[DecisionRecord]) -> dict[str, Any]:
    """一次規劃的摘要，給一行日誌用：幾題、幾題沒把握、LLM 各種結果幾次、LLM 一共花多久。"""
    asked = [r for r in records if r.llm_status is not None]
    return {
        "questions": len(records),
        "unsure": sum(r.unsure for r in records),
        "decided_by_llm": sum(r.decided_by == "llm" for r in records),
        "llm_status": dict(Counter(r.llm_status for r in asked)),
        "llm_latency_ms_total": round(sum(r.llm_latency_ms or 0.0 for r in asked), 1),
    }
