"""步驟 4：Jev 題目、排名、LLM 代選。"""

from dataclasses import replace
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.planning.choose import (
    MovieInfo,
    RestaurantInfo,
    apply_llm_pick,
    build_movie_question,
    build_restaurant_question,
    llm_alternatives,
    movie_code,
    needs_llm,
    rank_combos,
    restaurant_code,
)
from app.planning.feasibility import FilterResult
from app.planning.types import Buffers, Combo, Cost, Restaurant, Showtime

TZ = ZoneInfo("Asia/Taipei")
T0 = datetime(2026, 10, 22, 18, 0, tzinfo=TZ)


def combo(movie_id: int, rest_id: int, walk: int = 3, min_buffer: int = 10) -> Combo:
    show = Showtime(
        id=movie_id * 100 + rest_id,
        movie_id=movie_id,
        cinema_id=1,
        starts_at=T0,
        ends_at=T0 + timedelta(hours=2),
        ticket=350,
    )
    rest = Restaurant(id=rest_id, hub_id=1, walk_to_hub=5, meal_minutes=45, meal_cost=150)
    return Combo(
        order="movie_first",
        showtime=show,
        restaurant=rest,
        walk_cinema_restaurant=walk,
        arrive_cinema=T0,
        arrive_hub=None,
        arrive_restaurant=T0,
        meal_start=T0,
        meal_end=T0,
        leave_area_at=T0,
        latest_leave=T0,
        last_order_at=None,
        buffers=Buffers(showtime=min_buffer, last_order=None, return_trip=min_buffer + 50),
        cost=Cost(ticket=350, meal=150, fare_go=25, fare_return=25),
        return_ride_minutes=20,
    )


def result_of(combos: list[Combo], showtimes_by_movie: dict[int, int]) -> FilterResult:
    return FilterResult(
        combinations=100,
        feasible_count=len(combos),
        feasible=combos,
        reasons={},
        showtimes_by_movie=showtimes_by_movie,
    )


MOVIES = {
    i: MovieInfo(id=i, title=f"示意電影 {i}", genre="action", runtime_min=120, rating="普遍級")
    for i in range(1, 13)
}
RESTS = {
    i: RestaurantInfo(
        id=i, cuisine="japanese", date_suitability=2, price_range="200_500", meal_duration="normal"
    )
    for i in range(1, 13)
}
PREFS = {"cuisine": "japanese", "budget_per_person": 1000}


class TestQuestions:
    def test_movie_options_capped_and_sorted_by_showtime_count(self):
        combos = [combo(m, 1) for m in range(1, 13)]
        counts = {m: m for m in range(1, 13)}  # 12 號片場次最多
        q = build_movie_question(result_of(combos, counts), MOVIES, PREFS)
        assert len(q.options) == 10
        assert q.options[0].code == movie_code(12)
        assert q.options[-1].code == movie_code(3)
        assert q.options[0].attrs["genre"] == "action"

    def test_restaurant_options_sorted_by_walk(self):
        combos = [
            combo(1, 5, walk=8),
            combo(2, 5, walk=2),
            combo(1, 7, walk=4),
            combo(1, 9, walk=1),
        ]
        q = build_restaurant_question(result_of(combos, {1: 3, 2: 1}), RESTS, PREFS)
        assert [o.code for o in q.options] == [
            restaurant_code(9),
            restaurant_code(5),
            restaurant_code(7),
        ]
        # 同一家取最短的步行
        assert q.options[1].attrs["walk_minutes"] == 2
        # Google 的店名不能存，選項裡不放店名
        assert "name" not in q.options[0].attrs


class TestRank:
    def test_score_is_product_and_sorted(self):
        combos = [combo(1, 1), combo(1, 2), combo(2, 1), combo(2, 2)]
        p_movie = {1: 0.7, 2: 0.3}
        p_rest = {1: 0.4, 2: 0.6}
        ranked = rank_combos(combos, p_movie, p_rest)
        assert [r.combo.pair for r in ranked[:3]] == [(1, 2), (1, 1), (2, 2)]
        assert ranked[0].score == pytest.approx(0.42)

    def test_specified_movie_counts_as_one(self):
        ranked = rank_combos([combo(1, 1), combo(1, 2)], None, {1: 0.2, 2: 0.8})
        assert ranked[0].combo.pair == (1, 2)
        assert ranked[0].p_movie == 1.0
        assert ranked[0].score == pytest.approx(0.8)

    def test_options_not_asked_are_dropped(self):
        # 第 11 家以後沒有放進 Jev 的選項，沒有機率
        ranked = rank_combos([combo(1, 1), combo(1, 11)], {1: 1.0}, {1: 1.0})
        assert [r.combo.pair for r in ranked] == [(1, 1)]

    def test_tie_prefers_larger_buffer(self):
        ranked = rank_combos(
            [combo(1, 1, min_buffer=5), combo(1, 2, min_buffer=30)], None, {1: 0.5, 2: 0.5}
        )
        assert ranked[0].combo.pair == (1, 2)


class TestLlm:
    def test_needs_llm_below_threshold(self):
        assert needs_llm({1: 0.59, 2: 0.41})
        assert not needs_llm({1: 0.6, 2: 0.4})
        assert not needs_llm({1: 0.3, 2: 0.7}, threshold=0.6)

    def test_alternatives_are_other_top3(self):
        probs = {1: 0.4, 2: 0.3, 3: 0.2, 4: 0.1}
        assert llm_alternatives(probs, picked=2) == [1, 3]
        assert llm_alternatives(probs, picked=4) == [1, 2]

    def test_pick_moves_best_combo_with_option_to_first(self):
        ranked = rank_combos(
            [combo(1, 1), combo(1, 2), combo(2, 2), combo(2, 3)],
            {1: 0.55, 2: 0.45},
            {1: 0.5, 2: 0.3, 3: 0.2},
        )
        assert ranked[0].combo.pair == (1, 1)
        picked = apply_llm_pick(ranked, movie=None, restaurant=2)
        assert picked[0].combo.pair == (1, 2)
        # 其他維持原本的順序
        rest = [r.combo.pair for r in picked[1:]]
        assert rest == [p for p in (r.combo.pair for r in ranked) if p != (1, 2)]

    def test_pick_both(self):
        ranked = rank_combos(
            [combo(1, 1), combo(1, 2), combo(2, 2)], {1: 0.55, 2: 0.45}, {1: 0.5, 2: 0.5}
        )
        assert apply_llm_pick(ranked, movie=2, restaurant=2)[0].combo.pair == (2, 2)
        # 沒有同時符合兩個的組合時，先照電影
        assert apply_llm_pick(ranked, movie=2, restaurant=1)[0].combo.pair == (2, 2)

    def test_pick_none_keeps_order(self):
        ranked = rank_combos([combo(1, 1), combo(1, 2)], None, {1: 0.7, 2: 0.3})
        assert apply_llm_pick(ranked, movie=None, restaurant=None) == ranked

    def test_ranked_keeps_probabilities(self):
        ranked = rank_combos([combo(1, 1)], {1: 0.62}, {1: 0.44})
        r = ranked[0]
        assert (r.p_movie, r.p_restaurant) == (0.62, 0.44)
        assert replace(r, score=0).score == 0
