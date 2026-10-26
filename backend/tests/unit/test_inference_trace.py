"""代選和 Jev 回應附帶的紀錄欄位：狀態、延遲、模型、請求次數。

這些欄位只是記錄，不影響選擇；選擇結果的測試在 test_llm.py、test_jev_client.py。
"""

import json

import httpx
import pytest
import respx

from app.jev import client as jev_client
from app.jev.base import ChoiceAnswer, JevResult
from app.jev.client import JEV_URL, JevClient
from app.jev.mock import MockJev
from app.llm import LlmPick, LlmPicker, MockLlm
from app.planning.choose import ChoiceQuestion, Option

BASE = "http://ollama.test:11434"
QUESTION = ChoiceQuestion(
    id="restaurant",
    instructions="選一家最適合的餐廳",
    options=[
        Option("r1", "餐廳 1", {"cuisine": "japanese", "walk_minutes": 3}),
        Option("r2", "餐廳 2", {"cuisine": "western", "walk_minutes": 5}),
        Option("r3", "餐廳 3", {"cuisine": "chinese", "walk_minutes": 8}),
        Option("r4", "餐廳 4", {"cuisine": "korean", "walk_minutes": 9}),
    ],
    state={"cuisine": "japanese"},
)
PROBS = {"r1": 0.44, "r2": 0.31, "r3": 0.15, "r4": 0.10}


@pytest.fixture
def picker():
    return LlmPicker(base_url=BASE, model="qwen2.5:3b", timeout=1.0)


def reply(text: str) -> httpx.Response:
    return httpx.Response(200, json={"model": "qwen2.5:3b", "response": text, "done": True})


# ── LLM 代選 ─────────────────────────────────────────────


@respx.mock
def test_answer_records_ok_latency_and_model(picker):
    respx.post(f"{BASE}/api/generate").mock(return_value=reply(json.dumps({"choice": "r2"})))
    pick = picker.pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm, pick.status) == ("r2", True, "ok")
    assert pick.model == "qwen2.5:3b"
    assert pick.latency_ms is not None and pick.latency_ms >= 0


@pytest.mark.parametrize(
    ("side_effect", "status"),
    [
        (httpx.ReadTimeout("slow"), "timeout"),
        (httpx.ConnectTimeout("slow"), "timeout"),
        (httpx.ConnectError("refused"), "connect"),
        (httpx.RemoteProtocolError("broken"), "network"),
    ],
)
@respx.mock
def test_transport_failures_record_their_kind(picker, side_effect, status):
    respx.post(f"{BASE}/api/generate").mock(side_effect=side_effect)
    pick = picker.pick(QUESTION, PROBS)
    # 選擇照舊：退回 Jev 第一名
    assert (pick.code, pick.used_llm) == ("r1", False)
    assert pick.status == status
    assert pick.latency_ms is not None
    assert pick.model == "qwen2.5:3b"


@respx.mock
def test_http_error_status(picker):
    respx.post(f"{BASE}/api/generate").mock(return_value=httpx.Response(500))
    pick = picker.pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm, pick.status) == ("r1", False, "http")


@pytest.mark.parametrize("text", ["我覺得第二家不錯", '{"answer": "r2"}', '["r2"]'])
@respx.mock
def test_unparseable_answer_is_invalid_response(picker, text):
    respx.post(f"{BASE}/api/generate").mock(return_value=reply(text))
    pick = picker.pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm, pick.status) == ("r1", False, "invalid_response")


@respx.mock
def test_answer_outside_candidates_is_not_candidate(picker):
    respx.post(f"{BASE}/api/generate").mock(return_value=reply('{"choice": "r4"}'))
    pick = picker.pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm, pick.status) == ("r1", False, "not_candidate")


def test_mock_llm_is_disabled_and_not_timed():
    pick = MockLlm().pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm, pick.status) == ("r1", False, "disabled")
    assert pick.latency_ms is None and pick.model is None


def test_old_style_pick_still_works():
    # 其他模組和測試的假物件只給 code、used_llm
    pick = LlmPick(code="r2", used_llm=True)
    assert pick.status is None and pick.latency_ms is None and pick.model is None


# ── Jev ─────────────────────────────────────────────────


class FakeClock:
    """取代 time.perf_counter：只有測試推進時才會前進。"""

    def __init__(self):
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


RESPONSE = {
    "model": "jev-1.14.0",
    "answers": {"restaurant": {"type": "choice", "probabilities": {"r1": 0.62, "r2": 0.38}}},
    "usage": {"input_tokens": 120},
}


@pytest.fixture
def clock(monkeypatch):
    c = FakeClock()
    monkeypatch.setattr(jev_client.time, "perf_counter", c)
    return c


def slow(clock, *results, seconds=1.0):
    """每次請求花 `seconds` 秒，依序回傳或丟出 `results`。"""
    queue = list(results)

    def handler(request):
        clock.advance(seconds)
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    return handler


@respx.mock
def test_jev_latency_counts_only_requests(clock):
    respx.post(JEV_URL).mock(
        side_effect=slow(
            clock, httpx.Response(429), httpx.Response(529), httpx.Response(200, json=RESPONSE)
        )
    )
    # 限流等待每次 10 秒、退避也不算進延遲
    jev = JevClient("sk", "jev-latest", sleep=clock.advance, limiter=lambda: clock.advance(10))
    result = jev.choose([QUESTION])
    assert result.attempts == 3
    assert result.latency_ms == 3000.0
    assert result.answers["restaurant"].top == "r1"


@respx.mock
def test_jev_timeout_then_success(clock):
    respx.post(JEV_URL).mock(
        side_effect=slow(clock, httpx.ReadTimeout("slow"), httpx.Response(200, json=RESPONSE))
    )
    result = JevClient("sk", "jev-latest", sleep=clock.advance).choose([QUESTION])
    assert (result.attempts, result.latency_ms) == (2, 2000.0)


def test_mock_jev_leaves_timing_empty():
    result = MockJev().choose([QUESTION])
    assert result.latency_ms is None and result.attempts is None
    assert result.model == "jev-mock-1"


def test_old_style_jev_result_still_works():
    result = JevResult(answers={"q": ChoiceAnswer({"a": 1.0})}, model="x", input_tokens=1)
    assert result.latency_ms is None and result.attempts is None
