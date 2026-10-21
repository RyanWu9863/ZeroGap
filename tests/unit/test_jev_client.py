"""真的 Jev 用戶端（TypeSafe System One）。格式照官方文件（2026-10-21 查證），金鑰到了再實測。

文件：https://docs.typesafe.ai/api/system-one.md 、https://docs.typesafe.ai/api/errors.md
"""

import json

import httpx
import pytest
import respx

from app.jev.client import JEV_URL, JevClient, JevError
from app.planning.choose import ChoiceQuestion, Option

QUESTION = ChoiceQuestion(
    id="restaurant",
    instructions="選一家最適合的餐廳",
    options=[
        Option("r1", "餐廳 1", {"cuisine": "japanese", "walk_minutes": 3}),
        Option("r2", "餐廳 2", {"cuisine": "western", "walk_minutes": 5}),
    ],
    state={"cuisine": "japanese", "budget_per_person": 1000},
)
RESPONSE = {
    "model": "jev-1.14.0",
    "answers": {
        "restaurant": {
            "type": "choice",
            "choice": "r1",
            "confidence": 0.7,
            "probabilities": {"r1": 0.62, "r2": 0.38},
        }
    },
    "usage": {"input_tokens": 120, "output_tokens": 12},
}


def client(**kw):
    return JevClient("sk-test", "jev-latest", sleep=lambda s: None, **kw)


@respx.mock
def test_request_format():
    route = respx.post(JEV_URL).mock(return_value=httpx.Response(200, json=RESPONSE))
    client().choose([QUESTION], state={"order": "movie_first"})
    req = route.calls[0].request
    assert req.headers["authorization"] == "Bearer sk-test"
    body = json.loads(req.content)
    assert body["model"] == "jev-latest"
    q = body["questions"]["restaurant"]
    assert q["type"] == "choice"
    assert q["instructions"] == "選一家最適合的餐廳"
    # 選項寫在 criteria：代碼 → 說明（說明可以是物件）
    assert set(q["criteria"]) == {"r1", "r2"}
    assert q["criteria"]["r1"]["attrs"] == {"cuisine": "japanese", "walk_minutes": 3}
    assert q["criteria"]["r1"]["label"] == "餐廳 1"
    # 每題自己的偏好和整個請求的 state 合在一起
    assert body["state"]["order"] == "movie_first"
    assert body["state"]["questions"]["restaurant"] == {"cuisine": "japanese",
                                                        "budget_per_person": 1000}  # fmt: skip


@respx.mock
def test_response_parsing():
    respx.post(JEV_URL).mock(return_value=httpx.Response(200, json=RESPONSE))
    result = client().choose([QUESTION])
    answer = result.answers["restaurant"]
    assert answer.probabilities == {"r1": 0.62, "r2": 0.38}
    assert answer.confidence == 0.7
    assert answer.top == "r1"
    assert result.model == "jev-1.14.0"
    assert result.input_tokens == 120


@respx.mock
def test_429_and_529_are_retried_with_limiter_each_time():
    route = respx.post(JEV_URL).mock(
        side_effect=[httpx.Response(429), httpx.Response(529), httpx.Response(200, json=RESPONSE)]
    )
    waits, sleeps = [], []
    jev = JevClient("sk", "jev-latest", sleep=sleeps.append, limiter=lambda: waits.append(1))
    assert jev.choose([QUESTION]).answers["restaurant"].top == "r1"
    assert route.call_count == 3
    assert len(waits) == 3  # 重試也算進每分鐘的上限
    assert sleeps == [1, 2]  # 指數退避


@respx.mock
def test_client_errors_are_not_retried():
    route = respx.post(JEV_URL).mock(return_value=httpx.Response(422, json={"detail": "x"}))
    with pytest.raises(JevError, match="422"):
        client().choose([QUESTION])
    assert route.call_count == 1


@respx.mock
def test_missing_answer_is_an_error():
    respx.post(JEV_URL).mock(return_value=httpx.Response(200, json={**RESPONSE, "answers": {}}))
    with pytest.raises(JevError, match="restaurant"):
        client().choose([QUESTION])


def test_missing_key():
    with pytest.raises(JevError, match="TYPESAFE_API_KEY"):
        JevClient("", "jev-latest")
