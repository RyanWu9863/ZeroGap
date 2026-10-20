"""電影、餐廳備選的估計值（規格書 6.5、7.1 步驟 7）。

不多查 TDX，也不驗證營業時間，結果一律 `estimated: True`：
- 到家時間 ≈ 離開代表點（先吃飯時是離開影城）＋ 步驟 2 那條回程路線的交通時間，不含等車
- 每人花費 ＝ 票價 ＋ 餐費估計 ＋ 方案的去程車資 ＋ 步驟 2 那條回程路線的車資
"""

from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta
from typing import Any

from app.planning.types import Combo


def estimate(combo: Combo, plan_fare_go: int) -> tuple[datetime, int]:
    home_at = combo.leave_area_at + timedelta(minutes=combo.return_ride_minutes)
    total = (
        combo.showtime.ticket + combo.restaurant.meal_cost + plan_fare_go + combo.cost.fare_return
    )
    return home_at, total


def restaurant_alternatives(
    plan: Combo,
    restaurant_ids: Sequence[int],
    feasible: Mapping[tuple[int, int], Combo],
    probs: Mapping[int, float],
    names: Mapping[int, str | None],
    cuisines: Mapping[int, str | None],
    plan_fare_go: int,
) -> list[dict[str, Any]]:
    """換一家：電影不變，只列跟方案的電影接得上的餐廳【預設】。"""
    movie_id = plan.showtime.movie_id
    result = []
    for rid in restaurant_ids:
        combo = feasible.get((movie_id, rid))
        if combo is None:
            continue
        home_at, total = estimate(combo, plan_fare_go)
        result.append(
            {
                "restaurant_id": rid,
                "name": names.get(rid),
                "cuisine": cuisines.get(rid),
                "probability": probs.get(rid, 0.0),
                "home_at": home_at,
                "cost_per_person_total": total,
                "estimated": True,
            }
        )
    return result


def movie_alternatives(
    plan: Combo,
    movie_ids: Sequence[int],
    feasible: Mapping[tuple[int, int], Combo],
    probs: Mapping[int, float],
    p_restaurant: Mapping[int, float],
    titles: Mapping[int, str],
    names: Mapping[int, str | None],
    cuisines: Mapping[int, str | None],
    plan_fare_go: int,
) -> list[dict[str, Any]]:
    """換一部：同一家餐廳接得上就用同一家，不然用這部電影分數最高的可行餐廳【預設】。

    分數 = P(電影) × P(餐廳)，電影固定，所以就是比 P(餐廳)；同分時取最緊緩衝大的。
    """
    plan_rest = plan.restaurant.id
    result = []
    for mid in movie_ids:
        combo = feasible.get((mid, plan_rest))
        switched = combo is None
        if switched:
            candidates = [c for (m, _), c in feasible.items() if m == mid]
            if not candidates:
                continue
            combo = max(
                candidates,
                key=lambda c: (
                    p_restaurant.get(c.restaurant.id, 0.0),
                    c.min_buffer,
                    -c.restaurant.id,
                ),
            )
        home_at, total = estimate(combo, plan_fare_go)
        rid = combo.restaurant.id
        result.append(
            {
                "movie_id": mid,
                "title": titles.get(mid),
                "probability": probs.get(mid, 0.0),
                "home_at": home_at,
                "cost_per_person_total": total,
                "estimated": True,
                "restaurant_id": rid if switched else None,
                "restaurant_name": names.get(rid) if switched else None,
                "restaurant_cuisine": cuisines.get(rid) if switched else None,
            }
        )
    return result
