"""LlmPicker 的熔斷：Ollama 連續連不上時，不要每一題都等滿逾時。"""

import json

import httpx
import pytest
import respx

from app.llm import LlmPicker
from app.planning.choose import ChoiceQuestion, Option

BASE = "http://ollama.test:11434"
URL = f"{BASE}/api/generate"
QUESTION = ChoiceQuestion(
    id="restaurant",
    instructions="選一家最適合的餐廳",
    options=[Option("r1", "餐廳 1", {}), Option("r2", "餐廳 2", {}), Option("r3", "餐廳 3", {})],
)
PROBS = {"r1": 0.45, "r2": 0.35, "r3": 0.20}


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock():
    return Clock()


def picker(clock, **kw):
    return LlmPicker(base_url=BASE, model="qwen2.5:3b", timeout=1.0, clock=clock, **kw)


def ok(choice="r2"):
    return httpx.Response(200, json={"response": json.dumps({"choice": choice})})


@respx.mock
def test_opens_after_two_unreachable_and_skips_calls(clock):
    route = respx.post(URL).mock(side_effect=httpx.ConnectTimeout("slow"))
    p = picker(clock)
    assert p.pick(QUESTION, PROBS).status == "timeout"
    assert p.pick(QUESTION, PROBS).status == "timeout"
    for _ in range(5):
        pick = p.pick(QUESTION, PROBS)
        assert (pick.code, pick.used_llm, pick.status) == ("r1", False, "circuit_open")
        assert pick.latency_ms is None
    assert route.call_count == 2  # 熔斷後沒有再送請求


@respx.mock
def test_probe_after_cooldown_recovers(clock):
    route = respx.post(URL).mock(
        side_effect=[httpx.ConnectError("x"), httpx.ConnectError("x"), ok("r2"), ok("r3")]
    )
    p = picker(clock, breaker_cooldown=60)
    p.pick(QUESTION, PROBS)
    p.pick(QUESTION, PROBS)
    clock.now += 59
    assert p.pick(QUESTION, PROBS).status == "circuit_open"
    clock.now += 2  # 冷卻時間過了，先試一次
    assert p.pick(QUESTION, PROBS).status == "ok"
    assert p.pick(QUESTION, PROBS).code == "r3"  # 恢復正常
    assert route.call_count == 4


@respx.mock
def test_failed_probe_opens_again(clock):
    respx.post(URL).mock(side_effect=httpx.ConnectError("x"))
    p = picker(clock, breaker_cooldown=60)
    p.pick(QUESTION, PROBS)
    p.pick(QUESTION, PROBS)
    clock.now += 61
    assert p.pick(QUESTION, PROBS).status == "connect"  # 試了，還是連不上
    assert p.pick(QUESTION, PROBS).status == "circuit_open"


@respx.mock
def test_wrong_answers_do_not_count(clock):
    # Ollama 有回答，只是答錯：服務是通的，不熔斷
    route = respx.post(URL).mock(
        side_effect=[
            httpx.Response(200, json={"response": "亂答"}),
            ok("r9"),
            httpx.Response(200, json={"response": "亂答"}),
            ok("r2"),
        ]
    )
    p = picker(clock)
    statuses = [p.pick(QUESTION, PROBS).status for _ in range(4)]
    assert statuses == ["invalid_response", "not_candidate", "invalid_response", "ok"]
    assert route.call_count == 4


@respx.mock
def test_success_resets_the_count(clock):
    route = respx.post(URL).mock(
        side_effect=[httpx.ConnectError("x"), ok(), httpx.ConnectError("x"), ok()]
    )
    p = picker(clock)
    statuses = [p.pick(QUESTION, PROBS).status for _ in range(4)]
    assert statuses == ["connect", "ok", "connect", "ok"]  # 沒有連續兩次，不熔斷
    assert route.call_count == 4


@respx.mock
def test_breaker_can_be_disabled(clock):
    route = respx.post(URL).mock(return_value=httpx.Response(503))
    p = picker(clock, breaker_failures=0)
    assert [p.pick(QUESTION, PROBS).status for _ in range(4)] == ["http"] * 4
    assert route.call_count == 4


@respx.mock
def test_separate_pickers_do_not_share_state(clock):
    # planner 每次規劃建立新的 LlmPicker：上一次規劃熔斷，不影響下一次
    respx.post(URL).mock(side_effect=[httpx.ConnectError("x"), httpx.ConnectError("x"), ok()])
    first = picker(clock)
    first.pick(QUESTION, PROBS)
    first.pick(QUESTION, PROBS)
    assert first.pick(QUESTION, PROBS).status == "circuit_open"
    assert picker(clock).pick(QUESTION, PROBS).status == "ok"
