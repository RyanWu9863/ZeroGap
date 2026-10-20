"""模擬版 Jev（示意）。依題目的 state 給每個選項打分數，再用 softmax 換成機率。

結果固定、可重現。選項多時最高機率常常低於 0.6，跟真的 Jev 一樣會觸發 LLM 代選。
"""

import json
import math
import zlib
from typing import Any

from app.jev.base import ChoiceAnswer, JevResult
from app.planning.choose import ChoiceQuestion, Option
from app.planning.rules import meal_cost

MODEL = "jev-mock-1"


def _jitter(code: str) -> float:
    """每個選項固定的小差異（0～0.3），避免屬性一樣時機率完全相同。"""
    return (zlib.crc32(code.encode()) % 1000) / 1000 * 0.3


def _score_movie(o: Option, state: dict[str, Any]) -> float:
    a = o.attrs
    score = 0.1 * min(a.get("showtimes") or 0, 10)
    if state.get("movie_genre") and a.get("genre") == state["movie_genre"]:
        score += 2
    return score


def _score_restaurant(o: Option, state: dict[str, Any]) -> float:
    a = o.attrs
    score = 0.0
    if state.get("cuisine") and a.get("cuisine") == state["cuisine"]:
        score += 2
    score += 0.5 * (a.get("date_suitability") or 0)
    score -= 0.1 * (a.get("walk_minutes") or 0)
    budget = state.get("budget_per_person")
    if budget and meal_cost(a.get("price_range")) <= 0.4 * budget:
        score += 0.5
    return score


def _score_route(o: Option, state: dict[str, Any]) -> float:
    a = o.attrs
    return -(
        0.05 * (a.get("ride_minutes") or 0)
        + 0.5 * (a.get("transfers") or 0)
        + 0.01 * (a.get("fare") or 0)
        + 0.05 * (a.get("walk_minutes") or 0)
    )


def _scorer(question_id: str):
    if question_id == "movie":
        return _score_movie
    if question_id == "restaurant":
        return _score_restaurant
    if question_id.startswith("route"):
        return _score_route
    return lambda o, s: 0.0


def _softmax(scores: dict[str, float]) -> dict[str, float]:
    m = max(scores.values())
    exp = {k: math.exp(v - m) for k, v in scores.items()}
    total = sum(exp.values())
    return {k: v / total for k, v in exp.items()}


class MockJev:
    def choose(
        self, questions: list[ChoiceQuestion], state: dict[str, Any] | None = None
    ) -> JevResult:
        answers = {}
        for q in questions:
            merged = {**(state or {}), **q.state}
            score = _scorer(q.id)
            scores = {o.code: score(o, merged) + _jitter(o.code) for o in q.options}
            probs = _softmax(scores) if scores else {}
            top = max(probs.values()) if probs else 0.0
            answers[q.id] = ChoiceAnswer(probabilities=probs, confidence=round(top, 3))
        payload = json.dumps(
            [{"id": q.id, "options": [o.attrs for o in q.options]} for q in questions],
            ensure_ascii=False,
            default=str,
        )
        return JevResult(answers=answers, model=MODEL, input_tokens=max(1, len(payload) // 4))
