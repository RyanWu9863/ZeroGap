"""Jev 的介面（規格書 3.1）。真的用戶端第二階段才做（要 TypeSafe 金鑰）。

題目用 `app.planning.choose.ChoiceQuestion`；一次請求可以同時問好幾題。
"""

from dataclasses import dataclass
from typing import Any, Protocol

from app.planning.choose import ChoiceQuestion


@dataclass(frozen=True)
class ChoiceAnswer:
    probabilities: dict[str, float]  # 選項代碼 → 機率
    confidence: float | None = None  # 只記錄、不用來判斷（3.1）

    @property
    def top(self) -> str:
        # 同分時取代碼最小的，和 LLM 代選失敗時的退回（app.llm._ranked）一致。
        # 機率總和是 1、門檻 0.6 時遇不到：兩個選項不可能都 ≥ 0.6，同分一定會交給 LLM
        return min(self.probabilities, key=lambda k: (-self.probabilities[k], k))


@dataclass(frozen=True)
class JevResult:
    answers: dict[str, ChoiceAnswer]  # 題目 id → 答案
    model: str  # 回應裡的模型版本（3.1：每次判斷都要記下來）
    input_tokens: int  # 計費只算輸入 token，用來累加每月費用
    # 以下只是記錄，給決策紀錄用；模擬版不填
    latency_ms: float | None = None  # 送出請求到收到回應的時間（含重試），不含限流等待和退避
    attempts: int | None = None  # 送出幾次請求（含重試）


class Jev(Protocol):
    def choose(
        self, questions: list[ChoiceQuestion], state: dict[str, Any] | None = None
    ) -> JevResult: ...
