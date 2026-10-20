"""Ollama 代選：正常回答、亂答、逾時、連不上都要能處理（規格書 3、7.1）。"""

import json

import httpx
import pytest
import respx

from app.llm import LlmPicker, MockLlm
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


def ollama_reply(text: str) -> httpx.Response:
    return httpx.Response(200, json={"model": "qwen2.5:3b", "response": text, "done": True})


@respx.mock
def test_normal_answer(picker):
    route = respx.post(f"{BASE}/api/generate").mock(
        return_value=ollama_reply(json.dumps({"choice": "r2"}))
    )
    pick = picker.pick(QUESTION, PROBS)
    assert pick.code == "r2"
    assert pick.used_llm is True
    # 只給前 3 名，第 4 名不能出現在題目裡
    body = json.loads(route.calls[0].request.content)
    assert body["model"] == "qwen2.5:3b"
    assert body["stream"] is False
    assert body["format"]["properties"]["choice"]["enum"] == ["r1", "r2", "r3"]
    assert "r4" not in body["prompt"]
    assert body["keep_alive"] == "30m"
    assert "think" not in body


@respx.mock
def test_think_flag_is_sent_when_set():
    route = respx.post(f"{BASE}/api/generate").mock(return_value=ollama_reply('{"choice": "r1"}'))
    LlmPicker(base_url=BASE, model="qwen3:4b", think=False).pick(QUESTION, PROBS)
    assert json.loads(route.calls[0].request.content)["think"] is False


@respx.mock
def test_answer_not_in_candidates_falls_back_to_top(picker):
    respx.post(f"{BASE}/api/generate").mock(return_value=ollama_reply('{"choice": "r4"}'))
    pick = picker.pick(QUESTION, PROBS)
    assert pick.code == "r1"
    assert pick.used_llm is False


@respx.mock
def test_garbage_falls_back_to_top(picker):
    respx.post(f"{BASE}/api/generate").mock(return_value=ollama_reply("我覺得第二家不錯"))
    assert picker.pick(QUESTION, PROBS).code == "r1"


@respx.mock
def test_timeout_falls_back_to_top(picker):
    respx.post(f"{BASE}/api/generate").mock(side_effect=httpx.ReadTimeout("slow"))
    pick = picker.pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm) == ("r1", False)


@respx.mock
def test_connection_error_falls_back_to_top(picker):
    respx.post(f"{BASE}/api/generate").mock(side_effect=httpx.ConnectError("refused"))
    assert picker.pick(QUESTION, PROBS).code == "r1"


@respx.mock
def test_server_error_falls_back_to_top(picker):
    respx.post(f"{BASE}/api/generate").mock(return_value=httpx.Response(500))
    assert picker.pick(QUESTION, PROBS).code == "r1"


@respx.mock
def test_is_connected(picker):
    respx.get(f"{BASE}/api/tags").mock(return_value=httpx.Response(200, json={"models": []}))
    assert picker.is_connected() is True
    respx.get(f"{BASE}/api/tags").mock(side_effect=httpx.ConnectError("refused"))
    assert picker.is_connected() is False


def test_mock_llm_never_calls_out():
    pick = MockLlm().pick(QUESTION, PROBS)
    assert (pick.code, pick.used_llm) == ("r1", False)
    assert MockLlm().is_connected() is False
