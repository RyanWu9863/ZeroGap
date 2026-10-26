"""LLM 棄權（allow_abstain）：資料不夠時回答「無法判斷」，採用 Jev 最高的選項。預設關閉。"""

import json

import httpx
import respx

from app.llm import ABSTAIN, LlmPicker
from app.planning.choose import ChoiceQuestion, Option

BASE = "http://ollama.test:11434"
URL = f"{BASE}/api/generate"
QUESTION = ChoiceQuestion(
    id="restaurant",
    instructions="選一家最適合的餐廳",
    options=[Option("r1", "餐廳 1", {}), Option("r2", "餐廳 2", {}), Option("r3", "餐廳 3", {})],
    state={},
)
PROBS = {"r1": 0.45, "r2": 0.35, "r3": 0.20}


def reply(choice: str) -> httpx.Response:
    text = json.dumps({"choice": choice}, ensure_ascii=False)
    return httpx.Response(200, json={"response": text})


def picker(**kw):
    return LlmPicker(base_url=BASE, model="qwen2.5:3b", timeout=1.0, **kw)


@respx.mock
def test_off_by_default_request_is_unchanged():
    route = respx.post(URL).mock(return_value=reply("r2"))
    picker().pick(QUESTION, PROBS)
    body = json.loads(route.calls[0].request.content)
    assert body["format"]["properties"]["choice"]["enum"] == ["r1", "r2", "r3"]
    assert ABSTAIN not in body["prompt"]


@respx.mock
def test_off_by_default_abstain_answer_is_not_candidate():
    respx.post(URL).mock(return_value=reply(ABSTAIN))
    pick = picker().pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm, pick.status) == ("r1", False, "not_candidate")


@respx.mock
def test_on_adds_abstain_option_and_instruction():
    route = respx.post(URL).mock(return_value=reply("r2"))
    pick = picker(allow_abstain=True).pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm, pick.status) == ("r2", True, "ok")
    body = json.loads(route.calls[0].request.content)
    assert body["format"]["properties"]["choice"]["enum"] == ["r1", "r2", "r3", ABSTAIN]
    assert ABSTAIN in body["prompt"]


@respx.mock
def test_abstain_falls_back_to_jev_top():
    respx.post(URL).mock(return_value=reply(ABSTAIN))
    pick = picker(allow_abstain=True).pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm, pick.status) == ("r1", False, "abstain")
    assert pick.latency_ms is not None and pick.model == "qwen2.5:3b"


@respx.mock
def test_abstain_does_not_trip_the_breaker():
    route = respx.post(URL).mock(return_value=reply(ABSTAIN))
    p = picker(allow_abstain=True)
    assert [p.pick(QUESTION, PROBS).status for _ in range(3)] == ["abstain"] * 3
    assert route.call_count == 3  # 有回答就是連得上，不熔斷
