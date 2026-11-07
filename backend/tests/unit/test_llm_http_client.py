"""LlmPicker 重用同一個 httpx.Client：不再每次呼叫都建新的 client 和連線，逾時照舊。"""

import json

import httpx
import pytest
import respx

from app.llm import LlmPicker
from app.planning.choose import ChoiceQuestion, Option

BASE = "http://ollama.test:11434"
QUESTION = ChoiceQuestion(
    id="restaurant",
    instructions="選一家最適合的餐廳",
    options=[Option("r1", "餐廳 1", {}), Option("r2", "餐廳 2", {}), Option("r3", "餐廳 3", {})],
)
PROBS = {"r1": 0.45, "r2": 0.35, "r3": 0.20}


@pytest.fixture
def no_module_level_calls(monkeypatch):
    def fail(*args, **kw):
        raise AssertionError("不應該再用 httpx.post／httpx.get")

    monkeypatch.setattr(httpx, "post", fail)
    monkeypatch.setattr(httpx, "get", fail)


@respx.mock
def test_calls_share_one_client(no_module_level_calls, monkeypatch):
    created = []
    real_client = httpx.Client

    def counting_client(*args, **kw):
        created.append(1)
        return real_client(*args, **kw)

    monkeypatch.setattr(httpx, "Client", counting_client)
    reply = httpx.Response(200, json={"response": json.dumps({"choice": "r2"})})
    route = respx.post(f"{BASE}/api/generate").mock(return_value=reply)
    respx.get(f"{BASE}/api/tags").mock(return_value=httpx.Response(200))
    p = LlmPicker(base_url=BASE, model="qwen2.5:3b", timeout=7.0)
    assert [p.pick(QUESTION, PROBS).status for _ in range(3)] == ["ok"] * 3
    assert p.is_connected() is True
    assert len(created) == 1 and route.call_count == 3
    p.close()


@respx.mock
def test_timeouts_are_per_request_as_before():
    reply = httpx.Response(200, json={"response": json.dumps({"choice": "r2"})})
    gen = respx.post(f"{BASE}/api/generate").mock(return_value=reply)
    tags = respx.get(f"{BASE}/api/tags").mock(return_value=httpx.Response(200))
    p = LlmPicker(base_url=BASE, model="qwen2.5:3b", timeout=7.0)
    p.pick(QUESTION, PROBS)
    p.is_connected()
    assert gen.calls.last.request.extensions["timeout"]["read"] == 7.0
    assert tags.calls.last.request.extensions["timeout"]["read"] == 2.0
