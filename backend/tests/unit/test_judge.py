"""寫入時用 Ollama 判斷店家屬性（Jev 金鑰到之前的替代）。"""

import json

import httpx
import respx

from app.judge import RestaurantJudge

BASE = "http://ollama.test:11434"
CUISINES = {"japanese": "日式：壽司、拉麵", "chinese": "中式：台菜、小吃", "other": "其他"}


def judge():
    return RestaurantJudge(BASE, "qwen2.5:3b", cuisines=CUISINES, timeout=1.0)


def reply(obj):
    return httpx.Response(200, json={"response": json.dumps(obj), "done": True})


@respx.mock
def test_asks_only_missing_fields_with_enums():
    route = respx.post(f"{BASE}/api/generate").mock(
        return_value=reply({"price_range": "200_500", "date_suitability": 2})
    )
    out = judge().judge(
        "爭鮮迴轉壽司", {"amenity": "restaurant"}, ["price_range", "date_suitability"]
    )
    assert out == {"price_range": "200_500", "date_suitability": 2}
    body = json.loads(route.calls[0].request.content)
    props = body["format"]["properties"]
    assert set(props) == {"price_range", "date_suitability"}
    assert props["price_range"]["enum"] == ["under_200", "200_500", "500_1000", "over_1000"]
    assert props["date_suitability"]["enum"] == [0, 1, 2]
    assert "爭鮮迴轉壽司" in body["prompt"]


@respx.mock
def test_cuisine_enum_comes_from_categories():
    route = respx.post(f"{BASE}/api/generate").mock(
        return_value=reply({"category_code": "japanese"})
    )
    assert judge().judge("某拉麵", {}, ["category_code"]) == {"category_code": "japanese"}
    body = json.loads(route.calls[0].request.content)
    assert body["format"]["properties"]["category_code"]["enum"] == list(CUISINES)
    assert "壽司、拉麵" in body["prompt"]


@respx.mock
def test_invalid_values_are_dropped():
    respx.post(f"{BASE}/api/generate").mock(
        return_value=reply({"price_range": "cheap", "meal_duration": "fast"})
    )
    out = judge().judge("店", {}, ["price_range", "meal_duration"])
    assert out == {"meal_duration": "fast"}


@respx.mock
def test_failure_returns_empty():
    respx.post(f"{BASE}/api/generate").mock(side_effect=httpx.ConnectError("down"))
    assert judge().judge("店", {}, ["price_range"]) == {}
    respx.post(f"{BASE}/api/generate").mock(
        return_value=httpx.Response(200, json={"response": "?"})
    )
    assert judge().judge("店", {}, ["price_range"]) == {}


def test_nothing_to_ask():
    assert judge().judge("店", {}, []) == {}
