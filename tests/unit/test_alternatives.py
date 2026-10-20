"""電影、餐廳備選的估計值（規格書 6.5、7.1 步驟 7）。"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.planning.alternatives import (
    estimate,
    movie_alternatives,
    restaurant_alternatives,
)
from app.planning.types import Buffers, Combo, Cost, Restaurant, Showtime

TZ = ZoneInfo("Asia/Taipei")
T0 = datetime(2026, 10, 22, 18, 0, tzinfo=TZ)


def combo(movie_id: int, rest_id: int, *, leave_min: int = 180, meal: int = 150,
          fare_go: int = 25, fare_return: int = 25, ride: int = 20) -> Combo:  # fmt: skip
    show = Showtime(id=movie_id * 100 + rest_id, movie_id=movie_id, cinema_id=1,
                    starts_at=T0, ends_at=T0 + timedelta(hours=2), ticket=350)  # fmt: skip
    rest = Restaurant(id=rest_id, hub_id=1, walk_to_hub=5, meal_minutes=45, meal_cost=meal)
    return Combo(
        order="movie_first",
        showtime=show,
        restaurant=rest,
        walk_cinema_restaurant=3,
        arrive_cinema=T0,
        arrive_hub=None,
        arrive_restaurant=T0,
        meal_start=T0,
        meal_end=T0,
        leave_area_at=T0 + timedelta(minutes=leave_min),
        latest_leave=T0 + timedelta(hours=5),
        last_order_at=None,
        buffers=Buffers(showtime=10, last_order=None, return_trip=60),
        cost=Cost(ticket=350, meal=meal, fare_go=fare_go, fare_return=fare_return),
        return_ride_minutes=ride,
    )


def test_estimate_uses_step2_return_and_plan_go_fare():
    # 21:00 離開代表點 ＋ 回程 25 分鐘 → 21:25；去程車資用方案的 40，不用這組自己的 25
    c = combo(1, 2, leave_min=180, meal=750, fare_return=30, ride=25)
    home_at, total = estimate(c, plan_fare_go=40)
    assert home_at == T0 + timedelta(minutes=205)
    assert total == 350 + 750 + 40 + 30


def test_restaurant_alternatives_keep_plan_movie():
    plan = combo(1, 1)
    feasible = {c.pair: c for c in [plan, combo(1, 2, meal=750), combo(2, 3)]}
    alts = restaurant_alternatives(
        plan,
        [2, 3],
        feasible,
        probs={1: 0.44, 2: 0.31, 3: 0.12},
        names={2: "示意食堂 B", 3: None},
        cuisines={2: "japanese", 3: "western"},
        plan_fare_go=25,
    )
    # 3 號店跟 1 號片接不上，不列
    assert alts == [
        {
            "restaurant_id": 2,
            "name": "示意食堂 B",
            "cuisine": "japanese",
            "probability": 0.31,
            "home_at": T0 + timedelta(minutes=200),
            "cost_per_person_total": 350 + 750 + 25 + 25,
            "estimated": True,
        }
    ]


def test_movie_alternative_with_same_restaurant():
    plan = combo(1, 1)
    feasible = {c.pair: c for c in [plan, combo(2, 1, leave_min=200)]}
    alts = movie_alternatives(
        plan, [2], feasible, probs={1: 0.5, 2: 0.3}, p_restaurant={1: 0.9},
        titles={2: "示意電影 B"}, names={}, cuisines={}, plan_fare_go=25,
    )  # fmt: skip
    assert alts == [
        {
            "movie_id": 2,
            "title": "示意電影 B",
            "probability": 0.3,
            "home_at": T0 + timedelta(minutes=220),
            "cost_per_person_total": 550,
            "estimated": True,
            "restaurant_id": None,
            "restaurant_name": None,
            "restaurant_cuisine": None,
        }
    ]


def test_movie_alternative_switches_to_best_scoring_restaurant():
    plan = combo(1, 1)
    # 2 號片接不上 1 號店，只接得上 5、6 號店；6 號店的機率比較高
    feasible = {c.pair: c for c in [plan, combo(2, 5), combo(2, 6, meal=350, leave_min=190)]}
    alts = movie_alternatives(
        plan, [2], feasible, probs={1: 0.5, 2: 0.3}, p_restaurant={1: 0.5, 5: 0.1, 6: 0.3},
        titles={2: "示意電影 B"}, names={6: None}, cuisines={6: "korean"}, plan_fare_go=25,
    )  # fmt: skip
    alt = alts[0]
    assert alt["restaurant_id"] == 6
    assert alt["restaurant_name"] is None  # Pro 額度用完時沒有店名
    assert alt["restaurant_cuisine"] == "korean"
    assert alt["cost_per_person_total"] == 350 + 350 + 25 + 25
    assert alt["estimated"] is True


def test_movie_alternative_without_any_restaurant_is_skipped():
    plan = combo(1, 1)
    alts = movie_alternatives(
        plan, [2], {plan.pair: plan}, probs={1: 0.5, 2: 0.3}, p_restaurant={1: 0.5},
        titles={2: "示意電影 B"}, names={}, cuisines={}, plan_fare_go=25,
    )  # fmt: skip
    assert alts == []


def test_restaurant_not_in_jev_options_has_zero_probability_and_is_last_resort():
    plan = combo(1, 1)
    feasible = {c.pair: c for c in [plan, combo(2, 7), combo(2, 8)]}
    alts = movie_alternatives(
        plan, [2], feasible, probs={1: 0.5, 2: 0.3}, p_restaurant={1: 0.5, 8: 0.2},
        titles={2: "B"}, names={}, cuisines={}, plan_fare_go=25,
    )  # fmt: skip
    assert alts[0]["restaurant_id"] == 8
