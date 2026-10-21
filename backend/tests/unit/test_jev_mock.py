"""模擬版 Jev（示意）。"""

import random

import pytest

from app.jev.mock import MockJev
from app.planning.choose import ChoiceQuestion, Option


def restaurant_question(options, cuisine="japanese", budget=1000):
    return ChoiceQuestion(
        id="restaurant",
        instructions="選一家",
        options=options,
        state={"cuisine": cuisine, "budget_per_person": budget},
    )


def rest_option(i, cuisine="western", walk=5, suit=1, price="200_500"):
    return Option(
        code=f"r{i}",
        label=f"餐廳 {i}",
        attrs={
            "cuisine": cuisine,
            "date_suitability": suit,
            "price_range": price,
            "meal_duration": "normal",
            "walk_minutes": walk,
        },
    )


@pytest.fixture
def jev():
    return MockJev()


def test_probabilities_sum_to_one(jev):
    q = restaurant_question([rest_option(i) for i in range(5)])
    probs = jev.choose([q]).answers["restaurant"].probabilities
    assert set(probs) == {f"r{i}" for i in range(5)}
    assert sum(probs.values()) == pytest.approx(1.0)


def test_deterministic(jev):
    q = restaurant_question([rest_option(i, walk=i) for i in range(5)])
    assert jev.choose([q]) == MockJev().choose([q])


def test_cuisine_match_and_short_walk_score_higher(jev):
    q = restaurant_question(
        [rest_option(1, "western", walk=3), rest_option(2, "japanese", walk=3),
         rest_option(3, "japanese", walk=12)]
    )  # fmt: skip
    probs = jev.choose([q]).answers["restaurant"].probabilities
    assert probs["r2"] > probs["r1"]
    assert probs["r2"] > probs["r3"]


def test_ten_options_usually_below_threshold(jev):
    # 跟真的 Jev 一樣：選項多時最高機率常常低於 0.6，會觸發 LLM 代選（規格書 9）
    rng = random.Random(42)
    tops = []
    for _ in range(50):
        options = [
            rest_option(
                i,
                cuisine=rng.choice(["japanese", "western", "chinese"]),
                walk=rng.randint(1, 12),
                suit=rng.randint(0, 2),
                price=rng.choice(["under_200", "200_500", "500_1000"]),
            )
            for i in range(10)
        ]
        probs = jev.choose([restaurant_question(options)]).answers["restaurant"].probabilities
        tops.append(max(probs.values()))
    assert sum(tops) / len(tops) < 0.6


def test_multiple_questions_in_one_request(jev):
    movie = ChoiceQuestion(
        id="movie",
        instructions="選一部",
        options=[
            Option("m1", "示意電影 1", {"genre": "action", "showtimes": 3}),
            Option("m2", "示意電影 2", {"genre": "animation", "showtimes": 3}),
        ],
        state={"movie_genre": "animation"},
    )
    route = ChoiceQuestion(
        id="route_go_1",
        instructions="選一條",
        options=[
            Option(
                "a", "台鐵", {"ride_minutes": 20, "transfers": 0, "walk_minutes": 5, "fare": 25}
            ),
            Option(
                "b", "公車", {"ride_minutes": 45, "transfers": 1, "walk_minutes": 9, "fare": 30}
            ),
        ],
    )
    result = jev.choose([movie, route])
    assert result.answers["movie"].probabilities["m2"] > 0.5
    assert result.answers["route_go_1"].probabilities["a"] > 0.5
    assert result.model == "jev-mock-1"
    assert result.input_tokens > 0
