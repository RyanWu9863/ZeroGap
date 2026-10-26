"""步驟 4：組 Jev 題目、排名、LLM 代選（規格書 7.1）。

Jev 的選項代碼用 `m{電影 id}`、`r{餐廳 id}`；機率在 planner 轉回 id 為 key 的 dict。
"""

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any, Literal

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


@dataclass(frozen=True)
class DecisionFeatures:
    """一題 Jev 機率分布的特徵，給 Router 判斷和決策紀錄用。"""

    k: int  # 選項數
    p_top: float  # 第一名機率
    p_second: float  # 第二名機率；只有一個選項時是 0
    margin: float  # 第一名 − 第二名
    norm_entropy: float  # 熵 ÷ ln k：0 是完全確定，1 是每個選項一樣；只有一個選項時是 0


def decision_features(probs: Mapping[Any, float]) -> DecisionFeatures:
    """`probs` 不能是空的。熵先把機率正規化到總和 1 再算；其他特徵照原始機率。"""
    if not probs:
        raise ValueError("沒有選項")
    ps = sorted(probs.values(), reverse=True)
    k = len(ps)
    p_second = ps[1] if k > 1 else 0.0
    total = sum(ps)
    if k > 1 and total > 0:
        h = -sum(p / total * math.log(p / total) for p in ps if p > 0)
        norm_entropy = h / math.log(k)
    else:
        norm_entropy = 0.0
    return DecisionFeatures(k, ps[0], p_second, ps[0] - p_second, norm_entropy)


RouterKind = Literal["fixed", "options", "margin", "entropy"]


@dataclass(frozen=True)
class RouterPolicy:
    """判斷 Jev 有沒有把握的方式。`param` 的意思依 `kind` 而定：

    - fixed：最高機率 < param 就沒把握，和 `needs_llm` 完全相同（目前的做法，param 預設 0.6）
    - options：最高機率 < 1/k + param × (1 − 1/k)，門檻隨選項數 k 調整
    - margin：第一名 − 第二名 < param
    - entropy：熵 ÷ ln k > param

    除了 fixed，只有一個選項時一律算有把握。
    哪一種比較好要用標註資料比較；在有證據之前，預設維持 fixed 0.6。
    """

    kind: RouterKind = "fixed"
    param: float = MIN_TOP_PROBABILITY

    def __post_init__(self) -> None:
        if self.kind not in ("fixed", "options", "margin", "entropy"):
            raise ValueError(f"未知的 Router 政策：{self.kind}")
        if not 0 <= self.param <= 1:
            raise ValueError(f"param 要在 0～1 之間：{self.param}")

    def unsure(self, probs: Mapping[Any, float]) -> bool:
        if not probs:
            return False
        if self.kind == "fixed":
            return needs_llm(probs, self.param)
        f = decision_features(probs)
        if f.k == 1:
            return False
        if self.kind == "options":
            return f.p_top < 1 / f.k + self.param * (1 - 1 / f.k)
        if self.kind == "margin":
            return f.margin < self.param
        return f.norm_entropy > self.param


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


def route_code(index: int) -> str:
    return f"t{index}"


def build_route_question(question_id: str, routes: list) -> ChoiceQuestion:
    """步驟 6：從 TDX 回傳的路線選一條。`routes` 是 `app.planning.types.Route`。"""
    options = [
        Option(
            code=route_code(i),
            label=r.summary,
            attrs={
                "summary": r.summary,
                "depart_at": f"{r.depart_at:%H:%M}",
                "arrive_at": f"{r.arrive_at:%H:%M}",
                "ride_minutes": r.ride_minutes,
                "transfers": r.transfers,
                "walk_minutes": r.walk_before + r.walk_after,
                "fare": r.fare,
            },
        )
        for i, r in enumerate(routes)
    ]
    return ChoiceQuestion(
        id=question_id,
        instructions="選出最適合的一條路線：轉乘少、時間短、走路少、車資低。",
        options=options,
    )
