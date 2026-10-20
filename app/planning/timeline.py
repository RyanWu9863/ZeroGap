"""步驟 6～7：用精確路線重算一次，排出時間軸（規格書 6.5、7.1）。

精確路線比步驟 2 的估算慢、接不上時回傳 None，planner 會改用下一組。
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.planning.feasibility import check_meal_first, check_movie_first
from app.planning.rules import minutes_between
from app.planning.types import Combo, Conditions, Cost, Leg, Place, Rejected, Route


@dataclass(frozen=True)
class TimelinePlaces:
    station: Place  # 出發站，也是終點
    hub: Place  # 餐廳最近的代表點
    cinema: Place
    restaurant: Place


@dataclass(frozen=True)
class Timeline:
    combo: Combo  # 用精確路線重算過的組合
    steps: list[dict[str, Any]]
    depart_at: datetime
    home_at: datetime
    minutes_before_deadline: int
    min_buffer: int
    walk_minutes_total: int
    cost: Cost


def _step(type_: str, place: Place, gate: str | None = None, buffer: int | None = None, **fields):
    return {
        "type": type_,
        **fields,
        "place": place.to_dict(),
        "buffer_minutes": buffer,
        "buffer_gate": gate,
    }


def _transit(route: Route, place: Place) -> dict[str, Any]:
    return _step(
        "transit",
        place,
        **{
            "from": route.board_name,
            "to": route.alight_name,
            "summary": route.summary,
            "depart_at": route.depart_at,
            "arrive_at": route.arrive_at,
            "fare_per_person": route.fare,
        },
    )


def _walk(from_: str | None, to: str | None, minutes: int, arrive_at: datetime, place: Place,
          note: str | None = None, gate: str | None = None,
          buffer: int | None = None) -> dict[str, Any]:  # fmt: skip
    return _step(
        "walk",
        place,
        gate,
        buffer,
        **{"from": from_, "to": to, "minutes": minutes, "arrive_at": arrive_at, "note": note},
    )


def _return_window(c: Combo, ret: Route) -> dict[str, Any]:
    return {
        "planned_depart_at": ret.depart_at,
        "minutes_to_planned": minutes_between(c.leave_area_at, ret.leave_at),
        "latest_depart_at": c.latest_leave,
        "minutes_to_latest": c.buffers.return_trip,
    }


def build_timeline(
    combo: Combo, go: Route, ret: Route, places: TimelinePlaces, cond: Conditions
) -> Timeline | None:
    # 用精確的抵達時間和車資重算；「最晚要離開」仍用步驟 2 的值（6.5：最緊緩衝照它算）
    check = check_movie_first if combo.order == "movie_first" else check_meal_first
    exact = check(
        combo.showtime,
        combo.restaurant,
        combo.walk_cinema_restaurant,
        Leg(at=go.reach_at, fare=go.fare),
        Leg(at=combo.latest_leave, fare=ret.fare, ride_minutes=combo.return_ride_minutes),
        cond,
    )
    if isinstance(exact, Rejected):
        return None
    if go.leave_at < cond.earliest_departure:
        return None
    if ret.leave_at < exact.leave_area_at or ret.reach_at > cond.latest_home:
        return None

    p = places
    show, rest, b = exact.showtime, exact.restaurant, exact.buffers
    wait = _step("wait", p.restaurant, "last_order" if b.last_order is not None else None,
                 b.last_order, minutes=cond.wait_minutes, note="候位")  # fmt: skip
    meal = _step("meal", p.restaurant, starts_at=exact.meal_start, ends_at=exact.meal_end,
                 duration=rest.meal_duration)  # fmt: skip
    home = _step("home", p.station, "latest_return",
                 minutes_between(ret.reach_at, cond.latest_home),
                 station=p.station.name, arrive_at=ret.reach_at)  # fmt: skip

    if exact.order == "movie_first":
        steps = [
            _transit(go, p.station),
            _walk(go.alight_name, p.cinema.name, go.walk_after, exact.arrive_cinema, p.cinema,
                  "取票", gate="showtime", buffer=b.showtime),
            _step("movie", p.cinema, starts_at=show.starts_at, ends_at=show.ends_at),
            _walk(p.cinema.name, p.restaurant.name, exact.walk_cinema_restaurant,
                  exact.arrive_restaurant, p.restaurant),
            wait,
            meal,
            {**_walk(p.restaurant.name, p.hub.name, rest.walk_to_hub, exact.leave_area_at, p.hub,
                     gate="return_trip", buffer=b.return_trip),
             "return_window": _return_window(exact, ret)},
            _transit(ret, p.hub),
            home,
        ]  # fmt: skip
    else:
        steps = [
            _transit(go, p.station),
            _walk(go.alight_name, p.restaurant.name, rest.walk_to_hub, exact.arrive_restaurant,
                  p.restaurant),
            wait,
            meal,
            _walk(p.restaurant.name, p.cinema.name, exact.walk_cinema_restaurant,
                  exact.arrive_cinema, p.cinema, "取票",
                  gate="showtime", buffer=b.showtime),
            {**_step("movie", p.cinema, "return_trip", b.return_trip,
                     starts_at=show.starts_at, ends_at=show.ends_at),
             "return_window": _return_window(exact, ret)},
            _transit(ret, p.cinema),
            home,
        ]  # fmt: skip

    walk_total = (
        go.walk_before
        + go.walk_after
        + exact.walk_cinema_restaurant
        + rest.walk_to_hub
        + ret.walk_before
        + ret.walk_after
    )
    return Timeline(
        combo=exact,
        steps=steps,
        depart_at=go.leave_at,
        home_at=ret.reach_at,
        minutes_before_deadline=minutes_between(ret.reach_at, cond.latest_home),
        min_buffer=exact.min_buffer,
        walk_minutes_total=walk_total,
        cost=exact.cost,
    )
