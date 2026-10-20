"""步驟 3：篩出接得上的組合，並計數被排除的原因（規格書 6.4、7.1）。

每個條件依 `REASONS` 的順序檢查，第一個不符合的就是被排除的原因。
"""

from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.planning.rules import minutes_between
from app.planning.types import (
    REASONS,
    Buffers,
    Combo,
    Conditions,
    Cost,
    Leg,
    PlaceKey,
    Reason,
    Rejected,
    Restaurant,
    Showtime,
)


def _minutes(n: int) -> timedelta:
    return timedelta(minutes=n)


def _check_hours(
    rest: Restaurant, ready: datetime, cond: Conditions
) -> tuple[datetime, datetime | None, Reason | None]:
    """`ready` 是到店加候位、最早能開始吃的時間。

    回傳 (開始用餐, 最後點餐時間, 被排除的原因)。不知道營業時間時最後點餐是 None。
    比開門早到時，`max_wait_for_opening` 分鐘內就等開門，開始用餐改成開門時間。
    """
    if rest.hours is None:
        return ready, None, None
    meal_start = ready
    interval = rest.hours.interval_containing(ready)
    if interval is None:
        interval = rest.hours.next_opening(ready, cond.max_wait_for_opening)
        if interval is None:
            return ready, None, "opening_hours"
        meal_start = interval[0]
    last_order_at = interval[1] - _minutes(cond.last_order_before_close)
    if meal_start > last_order_at:
        return meal_start, last_order_at, "last_order"
    return meal_start, last_order_at, None


def check_movie_first(
    show: Showtime,
    rest: Restaurant,
    walk: int | None,
    go: Leg | None,
    ret: Leg | None,
    cond: Conditions,
) -> Combo | Rejected:
    """先看電影。`go`：出發站 → 影城；`ret`：餐廳最近的代表點 → 出發站。"""
    if go is None:
        return Rejected("showtime")
    gate = show.starts_at - _minutes(cond.arrive_before_showtime)
    if go.at > gate:
        return Rejected("showtime")
    if walk is None or walk > cond.max_walk_minutes:
        return Rejected("walk")

    arrive_restaurant = show.ends_at + _minutes(walk)
    ready = arrive_restaurant + _minutes(cond.wait_minutes)
    meal_start, last_order_at, reason = _check_hours(rest, ready, cond)
    if reason:
        return Rejected(reason)

    meal_end = meal_start + _minutes(rest.meal_minutes)
    at_hub = meal_end + _minutes(rest.walk_to_hub)
    if ret is None or at_hub > ret.at:
        return Rejected("last_train")

    cost = Cost(ticket=show.ticket, meal=rest.meal_cost, fare_go=go.fare, fare_return=ret.fare)
    if cost.total > cond.budget_per_person:
        return Rejected("budget")

    return Combo(
        order="movie_first",
        showtime=show,
        restaurant=rest,
        walk_cinema_restaurant=walk,
        arrive_cinema=go.at,
        arrive_hub=None,
        arrive_restaurant=arrive_restaurant,
        meal_start=meal_start,
        meal_end=meal_end,
        leave_area_at=at_hub,
        latest_leave=ret.at,
        last_order_at=last_order_at,
        buffers=Buffers(
            showtime=minutes_between(go.at, gate),
            last_order=None
            if last_order_at is None
            else minutes_between(meal_start, last_order_at),
            return_trip=minutes_between(at_hub, ret.at),
        ),
        cost=cost,
        return_ride_minutes=ret.ride_minutes,
    )


def check_meal_first(
    show: Showtime,
    rest: Restaurant,
    walk: int | None,
    go: Leg | None,
    ret: Leg | None,
    cond: Conditions,
) -> Combo | Rejected:
    """先吃飯。`go`：出發站 → 餐廳最近的代表點；`ret`：影城 → 出發站。"""
    if go is None:
        return Rejected("showtime")
    arrive_restaurant = go.at + _minutes(rest.walk_to_hub)
    ready = arrive_restaurant + _minutes(cond.wait_minutes)
    # 開門時間會影響後面全部的時間，所以先算；排除的原因還是照 6.4 的順序判斷
    meal_start, last_order_at, hours_reason = _check_hours(rest, ready, cond)
    meal_end = meal_start + _minutes(rest.meal_minutes)
    arrive_cinema = meal_end + _minutes(walk or 0)
    gate = show.starts_at - _minutes(cond.arrive_before_showtime)
    if arrive_cinema > gate:
        return Rejected("showtime")
    if walk is None or walk > cond.max_walk_minutes:
        return Rejected("walk")

    if hours_reason:
        return Rejected(hours_reason)

    if ret is None or show.ends_at > ret.at:
        return Rejected("last_train")

    cost = Cost(ticket=show.ticket, meal=rest.meal_cost, fare_go=go.fare, fare_return=ret.fare)
    if cost.total > cond.budget_per_person:
        return Rejected("budget")

    return Combo(
        order="meal_first",
        showtime=show,
        restaurant=rest,
        walk_cinema_restaurant=walk,
        arrive_cinema=arrive_cinema,
        arrive_hub=go.at,
        arrive_restaurant=arrive_restaurant,
        meal_start=meal_start,
        meal_end=meal_end,
        leave_area_at=show.ends_at,
        latest_leave=ret.at,
        last_order_at=last_order_at,
        buffers=Buffers(
            showtime=minutes_between(arrive_cinema, gate),
            last_order=None
            if last_order_at is None
            else minutes_between(meal_start, last_order_at),
            return_trip=minutes_between(show.ends_at, ret.at),
        ),
        cost=cost,
        return_ride_minutes=ret.ride_minutes,
    )


def check(
    show: Showtime,
    rest: Restaurant,
    walk: int | None,
    reach: Mapping[PlaceKey, Leg],
    leave: Mapping[PlaceKey, Leg],
    cond: Conditions,
) -> Combo | Rejected:
    """依吃飯順序，從步驟 2 的結果找出這一組要用的去程和回程。"""
    if cond.order == "movie_first":
        go = reach.get(("cinema", show.cinema_id))
        ret = leave.get(("hub", rest.hub_id))
        return check_movie_first(show, rest, walk, go, ret, cond)
    go = reach.get(("hub", rest.hub_id))
    ret = leave.get(("cinema", show.cinema_id))
    return check_meal_first(show, rest, walk, go, ret, cond)


@dataclass(frozen=True)
class FilterResult:
    combinations: int  # 場次數 × 餐廳數
    feasible_count: int  # 接得上的組合數（合併同一組電影 × 餐廳之前）
    feasible: list[Combo]  # 每組「電影 × 餐廳」只留最緊緩衝最大的一場
    reasons: dict[str, int]  # 只列出大於 0 的，依 REASONS 的順序
    showtimes_by_movie: dict[int, int]  # 每部電影有幾個接得上的場次，Jev 選項排序用


def _better(a: Combo, b: Combo) -> bool:
    """a 是否比 b 好：最緊緩衝大的優先，同分時取早的場次。"""
    return (a.min_buffer, -a.showtime.starts_at.timestamp(), -a.showtime.id) > (
        b.min_buffer,
        -b.showtime.starts_at.timestamp(),
        -b.showtime.id,
    )


def filter_all(
    showtimes: Iterable[Showtime],
    restaurants: Iterable[Restaurant],
    walk: Mapping[tuple[int, int], int],
    reach: Mapping[PlaceKey, Leg],
    leave: Mapping[PlaceKey, Leg],
    cond: Conditions,
) -> FilterResult:
    """所有「場次 × 餐廳」逐一檢查。`walk` 的 key 是 (影城 id, 餐廳 id)。"""
    showtimes = list(showtimes)
    restaurants = list(restaurants)
    reasons: Counter[str] = Counter()
    best: dict[tuple[int, int], Combo] = {}
    feasible_shows: dict[int, set[int]] = {}
    feasible_count = 0

    for show in showtimes:
        for rest in restaurants:
            result = check(show, rest, walk.get((show.cinema_id, rest.id)), reach, leave, cond)
            if isinstance(result, Rejected):
                reasons[result.reason] += 1
                continue
            feasible_count += 1
            feasible_shows.setdefault(show.movie_id, set()).add(show.id)
            current = best.get(result.pair)
            if current is None or _better(result, current):
                best[result.pair] = result

    return FilterResult(
        combinations=len(showtimes) * len(restaurants),
        feasible_count=feasible_count,
        feasible=list(best.values()),
        reasons={r: reasons[r] for r in REASONS if reasons[r]},
        showtimes_by_movie={m: len(s) for m, s in feasible_shows.items()},
    )
