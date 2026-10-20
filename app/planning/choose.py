"""步驟 4：組 Jev 題目、排名、LLM 代選（規格書 7.1）。

Jev 的選項代碼用 `m{電影 id}`、`r{餐廳 id}`；機率在 planner 轉回 id 為 key 的 dict。
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

from app.planning.feasibility import FilterResult
from app.planning.types import Combo

MAX_OPTIONS = 10
LLM_TOP_N = 3
MAX_ALTERNATIVES = 2
MIN_TOP_PROBABILITY = 0.6


@dataclass(frozen=True)
class Option:
    code: str
    label: str
    attrs: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ChoiceQuestion:
    id: str
    instructions: str
    options: list[Option]
    state: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MovieInfo:
    id: int
    title: str
    genre: str | None
    runtime_min: int
    rating: str | None


@dataclass(frozen=True)
class RestaurantInfo:
    """Jev 預先判斷好的屬性。Google 的店名不能存，所以這裡沒有店名。"""

    id: int
    cuisine: str | None
    date_suitability: int | None
    price_range: str | None
    meal_duration: str | None


def movie_code(movie_id: int) -> str:
    return f"m{movie_id}"


def restaurant_code(restaurant_id: int) -> str:
    return f"r{restaurant_id}"


def parse_code(code: str) -> int:
    return int(code[1:])


def build_movie_question(
    result: FilterResult,
    movies: Mapping[int, MovieInfo],
    prefs: Mapping[str, Any],
    max_options: int = MAX_OPTIONS,
) -> ChoiceQuestion:
    """選項是可行組合中出現的電影，依接得上的場次數排序。"""
    movie_ids = {c.showtime.movie_id for c in result.feasible}
    ordered = sorted(movie_ids, key=lambda m: (-result.showtimes_by_movie.get(m, 0), m))
    options = [
        Option(
            code=movie_code(m),
            label=movies[m].title,
            attrs={
                "genre": movies[m].genre,
                "runtime_min": movies[m].runtime_min,
                "rating": movies[m].rating,
                "showtimes": result.showtimes_by_movie.get(m, 0),
            },
        )
        for m in ordered[:max_options]
    ]
    return ChoiceQuestion(
        id="movie",
        instructions="依使用者偏好的片型、影廳、語言，選出最適合這次行程的一部電影。",
        options=options,
        state={k: prefs.get(k) for k in ("movie_genre", "hall_type", "language")},
    )


def build_restaurant_question(
    result: FilterResult,
    restaurants: Mapping[int, RestaurantInfo],
    prefs: Mapping[str, Any],
    max_options: int = MAX_OPTIONS,
) -> ChoiceQuestion:
    """選項是可行組合中出現的餐廳，依步行距離排序；同一家取最短的步行。"""
    walk: dict[int, int] = {}
    for c in result.feasible:
        rid = c.restaurant.id
        walk[rid] = min(walk.get(rid, c.walk_cinema_restaurant), c.walk_cinema_restaurant)
    ordered = sorted(walk, key=lambda r: (walk[r], r))
    options = []
    for r in ordered[:max_options]:
        info = restaurants[r]
        options.append(
            Option(
                code=restaurant_code(r),
                label=f"餐廳 {r}",
                attrs={
                    "cuisine": info.cuisine,
                    "date_suitability": info.date_suitability,
                    "price_range": info.price_range,
                    "meal_duration": info.meal_duration,
                    "walk_minutes": walk[r],
                },
            )
        )
    return ChoiceQuestion(
        id="restaurant",
        instructions="依使用者想吃的類別和每人預算，選出最適合這次行程的一家餐廳。",
        options=options,
        state={k: prefs.get(k) for k in ("cuisine", "budget_per_person")},
    )


@dataclass(frozen=True)
class Ranked:
    combo: Combo
    score: float
    p_movie: float
    p_restaurant: float


def rank_combos(
    combos: Iterable[Combo],
    p_movie: Mapping[int, float] | None,
    p_restaurant: Mapping[int, float],
) -> list[Ranked]:
    """分數 = P(電影) × P(餐廳)。`p_movie` 是 None 代表使用者指定了電影，機率當作 1。

    沒有放進 Jev 選項的電影或餐廳沒有機率，直接略過。
    同分時，最緊緩衝大的優先，再依 (電影 id, 餐廳 id)，讓結果固定。
    """
    ranked = []
    for c in combos:
        pm = 1.0 if p_movie is None else p_movie.get(c.showtime.movie_id)
        pr = p_restaurant.get(c.restaurant.id)
        if pm is None or pr is None:
            continue
        ranked.append(Ranked(combo=c, score=pm * pr, p_movie=pm, p_restaurant=pr))
    ranked.sort(key=lambda r: (-r.score, -r.combo.min_buffer, r.combo.pair))
    return ranked


def needs_llm(probs: Mapping[Any, float], threshold: float = MIN_TOP_PROBABILITY) -> bool:
    """Jev 沒把握：最高機率低於門檻。"""
    return bool(probs) and max(probs.values()) < threshold


def top_n(probs: Mapping[int, float], n: int = LLM_TOP_N) -> list[int]:
    return sorted(probs, key=lambda k: (-probs[k], k))[:n]


def llm_alternatives(
    probs: Mapping[int, float],
    picked: int,
    n: int = LLM_TOP_N,
    max_alternatives: int = MAX_ALTERNATIVES,
) -> list[int]:
    """LLM 從前 n 名選了 `picked`，其他的就是備選。"""
    return [k for k in top_n(probs, n) if k != picked][:max_alternatives]


def apply_llm_pick(ranked: list[Ranked], movie: int | None, restaurant: int | None) -> list[Ranked]:
    """把含 LLM 選中選項、分數最高的組合排到第一名，其他維持原本的順序。

    電影和餐廳都由 LLM 選時，先找兩個都符合的；沒有就只照電影，再沒有就只照餐廳。
    """
    if movie is None and restaurant is None:
        return ranked

    def matches(r: Ranked, m: int | None, rest: int | None) -> bool:
        return (m is None or r.combo.showtime.movie_id == m) and (
            rest is None or r.combo.restaurant.id == rest
        )

    for m, rest in ((movie, restaurant), (movie, None), (None, restaurant)):
        if m is None and rest is None:
            continue
        hit = next((i for i, r in enumerate(ranked) if matches(r, m, rest)), None)
        if hit is not None:
            return [ranked[hit], *ranked[:hit], *ranked[hit + 1 :]]
    return ranked
