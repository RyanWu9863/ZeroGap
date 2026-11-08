"""RestaurantJudge、MovieJudge 重用同一個 httpx.Client：不再每次判斷都建新的 client，逾時照舊。"""

import json

import httpx
import pytest
import respx

from app.judge import MovieJudge, RestaurantJudge

BASE = "http://ollama.test:11434"
CUISINES = {"japanese": "日式", "other": "其他"}
GENRES = {"action": "動作", "drama": "劇情"}


@pytest.fixture
def counted_clients(monkeypatch):
    def fail(*args, **kw):
        raise AssertionError("不應該再用 httpx.post")

    monkeypatch.setattr(httpx, "post", fail)
    created = []
    real_client = httpx.Client

    def counting_client(*args, **kw):
        created.append(1)
        return real_client(*args, **kw)

    monkeypatch.setattr(httpx, "Client", counting_client)
    return created


def reply(obj):
    return httpx.Response(200, json={"response": json.dumps(obj), "done": True})


@respx.mock
def test_restaurant_judge_shares_one_client(counted_clients):
    route = respx.post(f"{BASE}/api/generate").mock(return_value=reply({"price_range": "200_500"}))
    j = RestaurantJudge(BASE, "qwen2.5:3b", cuisines=CUISINES, timeout=7.0)
    outs = [j.judge(f"店 {i}", {}, ["price_range"]) for i in range(3)]
    assert outs == [{"price_range": "200_500"}] * 3
    assert len(counted_clients) == 1 and route.call_count == 3
    assert route.calls.last.request.extensions["timeout"]["read"] == 7.0
    j.close()


@respx.mock
def test_movie_judge_shares_one_client(counted_clients):
    route = respx.post(f"{BASE}/api/generate").mock(return_value=reply({"genre": "drama"}))
    j = MovieJudge(BASE, "qwen2.5:3b", genres=GENRES, timeout=9.0)
    assert [j.genre(f"片 {i}", None, None) for i in range(3)] == ["drama"] * 3
    assert len(counted_clients) == 1 and route.call_count == 3
    assert route.calls.last.request.extensions["timeout"]["read"] == 9.0
    j.close()


@respx.mock
def test_errors_still_handled_with_shared_client():
    respx.post(f"{BASE}/api/generate").mock(side_effect=httpx.ReadTimeout("slow"))
    r = RestaurantJudge(BASE, "qwen2.5:3b", cuisines=CUISINES, timeout=1.0)
    m = MovieJudge(BASE, "qwen2.5:3b", genres=GENRES, timeout=1.0)
    assert r.judge("店", {}, ["price_range"]) == {}
    assert m.genre("片", None, None) is None
    r.close()
    m.close()
