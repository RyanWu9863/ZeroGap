"""步驟 7：時間軸、緩衝與 return_window。先看電影照規格書 6.5 的範例。"""

from dataclasses import replace
from datetime import datetime
from zoneinfo import ZoneInfo

from app.planning.feasibility import check_meal_first, check_movie_first
from app.planning.opening_hours import OpeningHours
from app.planning.timeline import TimelinePlaces, build_timeline
from app.planning.types import Conditions, Leg, Place, Restaurant, Route, Showtime

TZ = ZoneInfo("Asia/Taipei")


def t(hh: int, mm: int = 0, day: int = 22) -> datetime:
    return datetime(2026, 10, day, hh, mm, tzinfo=TZ)


SHOW = Showtime(id=1, movie_id=31, cinema_id=3, starts_at=t(17, 55), ends_at=t(19, 54), ticket=350)
REST = Restaurant(
    id=45,
    hub_id=1,
    walk_to_hub=5,
    meal_minutes=45,
    meal_cost=150,
    hours=OpeningHours.parse("Mo-Su 11:00-21:30"),
    meal_duration="fast",
)
COND = Conditions(
    order="movie_first",
    earliest_departure=t(17),
    latest_home=t(23),
    max_walk_minutes=12,
    budget_per_person=1000,
)
PLACES = TimelinePlaces(
    station=Place(kind="station", id=1021, name="中壢", lat=24.95, lng=121.23),
    hub=Place(kind="hub", id=1, name="桃園站", lat=24.99, lng=121.31),
    cinema=Place(kind="cinema", id=3, name="示意影城 桃園 A", lat=24.99, lng=121.31),
    restaurant=Place(kind="restaurant", id=45, name="示意食堂", place_id="ChIJ..."),
)
GO = Route(
    summary="台鐵",
    fare=25,
    depart_at=t(17, 5),
    arrive_at=t(17, 25),
    board_name="中壢",
    alight_name="桃園",
    walk_after=5,
)
RET = Route(
    summary="台鐵",
    fare=25,
    depart_at=t(21, 5),
    arrive_at=t(21, 25),
    board_name="桃園",
    alight_name="中壢",
)


def movie_first_combo():
    return check_movie_first(
        SHOW, REST, 3, Leg(at=t(17, 30), fare=25), Leg(at=t(22, 28), fare=25), COND
    )


def test_movie_first_matches_spec_6_5():
    tl = build_timeline(movie_first_combo(), GO, RET, PLACES, COND)
    station = {"kind": "station", "id": 1021, "name": "中壢", "lat": 24.95, "lng": 121.23}
    hub = {"kind": "hub", "id": 1, "name": "桃園站", "lat": 24.99, "lng": 121.31}
    cinema = {"kind": "cinema", "id": 3, "name": "示意影城 桃園 A", "lat": 24.99, "lng": 121.31}
    rest = {"kind": "restaurant", "id": 45, "name": "示意食堂", "place_id": "ChIJ..."}
    none = {"buffer_minutes": None, "buffer_gate": None}

    assert tl.steps == [
        {"type": "transit", "from": "中壢", "to": "桃園", "summary": "台鐵",
         "depart_at": t(17, 5), "arrive_at": t(17, 25), "fare_per_person": 25,
         "place": station, **none},
        {"type": "walk", "from": "桃園", "to": "示意影城 桃園 A", "minutes": 5,
         "arrive_at": t(17, 30), "note": "取票", "place": cinema,
         "buffer_minutes": 10, "buffer_gate": "showtime"},
        {"type": "movie", "starts_at": t(17, 55), "ends_at": t(19, 54), "place": cinema, **none},
        {"type": "walk", "from": "示意影城 桃園 A", "to": "示意食堂", "minutes": 3,
         "arrive_at": t(19, 57), "note": None, "place": rest, **none},
        {"type": "wait", "minutes": 10, "note": "候位", "place": rest,
         "buffer_minutes": 53, "buffer_gate": "last_order"},
        {"type": "meal", "starts_at": t(20, 7), "ends_at": t(20, 52), "duration": "fast",
         "place": rest, **none},
        {"type": "walk", "from": "示意食堂", "to": "桃園站", "minutes": 5,
         "arrive_at": t(20, 57), "note": None, "place": hub,
         "buffer_minutes": 91, "buffer_gate": "return_trip",
         "return_window": {"planned_depart_at": t(21, 5), "minutes_to_planned": 8,
                           "latest_depart_at": t(22, 28), "minutes_to_latest": 91}},
        {"type": "transit", "from": "桃園", "to": "中壢", "summary": "台鐵",
         "depart_at": t(21, 5), "arrive_at": t(21, 25), "fare_per_person": 25,
         "place": hub, **none},
        {"type": "home", "station": "中壢", "arrive_at": t(21, 25), "place": station,
         "buffer_minutes": 95, "buffer_gate": "latest_return"},
    ]  # fmt: skip
    assert tl.depart_at == t(17, 5)
    assert tl.home_at == t(21, 25)
    assert tl.minutes_before_deadline == 95
    assert tl.min_buffer == 10
    assert tl.cost.total == 550
    assert tl.walk_minutes_total == 5 + 3 + 5


def test_non_google_restaurant_has_coordinates():
    places = replace(
        PLACES, restaurant=Place(kind="restaurant", id=45, name="示意食堂", lat=25.0, lng=121.3)
    )
    tl = build_timeline(movie_first_combo(), GO, RET, places, COND)
    assert tl.steps[3]["place"] == {
        "kind": "restaurant", "id": 45, "name": "示意食堂", "lat": 25.0, "lng": 121.3
    }  # fmt: skip


def test_exact_route_too_late_is_rejected():
    late = replace(GO, depart_at=t(17, 20), arrive_at=t(17, 36))  # 17:41 才到影城
    assert build_timeline(movie_first_combo(), late, RET, PLACES, COND) is None


def test_go_route_before_earliest_departure_is_rejected():
    early = replace(GO, depart_at=t(16, 50), arrive_at=t(17, 10))
    assert build_timeline(movie_first_combo(), early, RET, PLACES, COND) is None


def test_return_route_leaving_before_we_get_there_is_rejected():
    ret = replace(RET, depart_at=t(20, 50), arrive_at=t(21, 10))
    assert build_timeline(movie_first_combo(), GO, ret, PLACES, COND) is None


def test_return_route_home_too_late_is_rejected():
    ret = replace(RET, depart_at=t(22, 50), arrive_at=t(23, 10))
    assert build_timeline(movie_first_combo(), GO, ret, PLACES, COND) is None


def test_exact_fares_are_rechecked_against_budget():
    expensive = replace(RET, fare=500)
    cond = replace(COND, budget_per_person=600)
    combo = check_movie_first(
        SHOW, REST, 3, Leg(at=t(17, 30), fare=25), Leg(at=t(22, 28), fare=25), cond
    )
    assert build_timeline(combo, GO, expensive, PLACES, cond) is None


def test_meal_first_gates():
    cond = replace(COND, order="meal_first")
    show = replace(SHOW, starts_at=t(18, 50), ends_at=t(20, 49))
    combo = check_meal_first(
        show, REST, 3, Leg(at=t(17, 20), fare=25), Leg(at=t(22, 28), fare=30), cond
    )
    go = Route(
        summary="台鐵", fare=25, depart_at=t(17, 0), arrive_at=t(17, 18),
        board_name="中壢", alight_name="桃園",
    )  # fmt: skip
    ret = Route(
        summary="公車", fare=30, depart_at=t(21, 0), arrive_at=t(21, 40),
        board_name="影城站", alight_name="中壢", walk_before=4,
    )  # fmt: skip
    tl = build_timeline(combo, go, ret, PLACES, cond)
    types = [s["type"] for s in tl.steps]
    assert types == ["transit", "walk", "wait", "meal", "walk", "movie", "transit", "home"]
    by_gate = {s["buffer_gate"]: s for s in tl.steps if s["buffer_gate"]}
    # 精確路線 17:18 就到桃園站，用餐也跟著提早：17:23 到店、17:33 開始、18:18 吃完、18:21 到影城
    assert by_gate["last_order"]["type"] == "wait"
    assert by_gate["last_order"]["buffer_minutes"] == 207
    assert by_gate["showtime"]["type"] == "walk"
    assert by_gate["showtime"]["arrive_at"] == t(18, 21)
    assert by_gate["showtime"]["buffer_minutes"] == 14
    # return_trip 放在 movie：散場 20:49，最晚 22:28 要離開
    movie = by_gate["return_trip"]
    assert movie["type"] == "movie"
    assert movie["buffer_minutes"] == 99
    assert movie["return_window"] == {
        "planned_depart_at": t(21, 0),
        "minutes_to_planned": 7,  # 20:56 要從影城出發走去站牌
        "latest_depart_at": t(22, 28),
        "minutes_to_latest": 99,
    }
    assert tl.steps[6]["place"]["kind"] == "cinema"
    assert tl.home_at == t(21, 40)
    assert tl.min_buffer == 14
    assert tl.walk_minutes_total == 5 + 3 + 4
