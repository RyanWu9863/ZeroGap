"""步驟 3：可行性檢查。數字照規格書 6.5 的範例。"""

from dataclasses import replace
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.planning.feasibility import check_meal_first, check_movie_first, filter_all
from app.planning.opening_hours import OpeningHours
from app.planning.types import Conditions, Leg, Rejected, Restaurant, Showtime

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
)
WALK = 3  # 影城 → 餐廳
GO = Leg(at=t(17, 30), fare=25, ride_minutes=20)  # 最早 17:30 到影城
RET = Leg(at=t(22, 28), fare=25, ride_minutes=20)  # 最晚 22:28 要離開桃園站
COND = Conditions(
    order="movie_first",
    earliest_departure=t(17),
    latest_home=t(23),
    max_walk_minutes=12,
    budget_per_person=1000,
)


class TestMovieFirst:
    def test_spec_6_5_example(self):
        c = check_movie_first(SHOW, REST, WALK, GO, RET, COND)
        assert not isinstance(c, Rejected)
        assert c.arrive_cinema == t(17, 30)
        assert c.arrive_restaurant == t(19, 57)
        assert c.meal_start == t(20, 7)
        assert c.meal_end == t(20, 52)
        assert c.leave_area_at == t(20, 57)
        assert c.last_order_at == t(21, 0)
        assert c.buffers.showtime == 10
        assert c.buffers.last_order == 53
        assert c.buffers.return_trip == 91
        assert c.min_buffer == 10
        assert c.cost.total == 350 + 150 + 25 + 25 == 550

    def test_no_go_route_is_showtime(self):
        assert check_movie_first(SHOW, REST, WALK, None, RET, COND) == Rejected("showtime")

    def test_late_arrival_is_showtime(self):
        go = replace(GO, at=t(17, 41))  # 開演前 15 分鐘是 17:40
        assert check_movie_first(SHOW, REST, WALK, go, RET, COND) == Rejected("showtime")

    def test_arrival_exactly_at_gate_is_ok(self):
        go = replace(GO, at=t(17, 40))
        c = check_movie_first(SHOW, REST, WALK, go, RET, COND)
        assert c.buffers.showtime == 0

    def test_walk(self):
        assert check_movie_first(SHOW, REST, 13, GO, RET, COND) == Rejected("walk")
        assert check_movie_first(SHOW, REST, None, GO, RET, COND) == Rejected("walk")

    def test_opening_hours(self):
        rest = replace(REST, hours=OpeningHours.parse("Mo-Su 11:00-14:00"))
        assert check_movie_first(SHOW, rest, WALK, GO, RET, COND) == Rejected("opening_hours")

    def test_waits_for_opening_up_to_30_minutes(self):
        # 19:57 到店、候位到 20:07；店 20:30 才開 → 等到 20:30 開始吃
        rest = replace(REST, hours=OpeningHours.parse("Mo-Su 20:30-23:00"))
        c = check_movie_first(SHOW, rest, WALK, GO, RET, COND)
        assert not isinstance(c, Rejected)
        assert c.meal_start == t(20, 30)
        assert c.meal_end == t(21, 15)
        assert c.buffers.last_order == 2 * 60  # 22:30 − 20:30

    def test_opening_more_than_30_minutes_later_is_rejected(self):
        rest = replace(REST, hours=OpeningHours.parse("Mo-Su 20:38-23:00"))
        assert check_movie_first(SHOW, rest, WALK, GO, RET, COND) == Rejected("opening_hours")

    def test_last_order(self):
        # 20:07 開始用餐，20:30 打烊 → 最後點餐 20:00
        rest = replace(REST, hours=OpeningHours.parse("Mo-Su 11:00-20:30"))
        assert check_movie_first(SHOW, rest, WALK, GO, RET, COND) == Rejected("last_order")

    def test_unknown_hours_skip_both_checks(self):
        # Google 來源：營業時間要到步驟 5 才知道
        rest = replace(REST, hours=None)
        c = check_movie_first(SHOW, rest, WALK, GO, RET, COND)
        assert c.last_order_at is None
        assert c.buffers.last_order is None
        assert c.min_buffer == 10

    def test_last_train(self):
        ret = replace(RET, at=t(20, 56))  # 20:57 才走到代表點
        assert check_movie_first(SHOW, REST, WALK, GO, ret, COND) == Rejected("last_train")
        assert check_movie_first(SHOW, REST, WALK, GO, None, COND) == Rejected("last_train")

    def test_budget(self):
        cond = replace(COND, budget_per_person=549)
        assert check_movie_first(SHOW, REST, WALK, GO, RET, cond) == Rejected("budget")
        cond = replace(COND, budget_per_person=550)
        assert not isinstance(check_movie_first(SHOW, REST, WALK, GO, RET, cond), Rejected)

    def test_first_failing_reason_wins(self):
        # 走太遠又超過預算：walk 排在 budget 前面
        cond = replace(COND, budget_per_person=100)
        assert check_movie_first(SHOW, REST, 30, GO, RET, cond) == Rejected("walk")

    def test_home_after_midnight(self):
        # 22:30 的場次，隔天 00:29 散場；最晚 01:40 要離開，隔天 02:00 前到家
        show = Showtime(
            id=2,
            movie_id=31,
            cinema_id=3,
            starts_at=t(22, 30),
            ends_at=t(0, 29, day=23),
            ticket=350,
        )
        rest = replace(REST, hours=OpeningHours.parse("Mo-Su 18:00-03:00"))
        ret = Leg(at=t(1, 40, day=23), fare=25, ride_minutes=20)
        cond = replace(COND, latest_home=t(2, day=23))
        c = check_movie_first(show, rest, WALK, GO, ret, cond)
        assert not isinstance(c, Rejected)
        assert c.meal_start == t(0, 42, day=23)
        assert c.last_order_at == t(2, 30, day=23)
        assert c.leave_area_at == t(1, 32, day=23)
        assert c.buffers.return_trip == 8


class TestMealFirst:
    # 17:20 到桃園站，走 5 分鐘到店，17:35 開始用餐，18:20 吃完，走 3 分鐘到影城 18:23
    SHOW = Showtime(
        id=1, movie_id=31, cinema_id=3, starts_at=t(18, 50), ends_at=t(20, 49), ticket=350
    )
    GO = Leg(at=t(17, 20), fare=25, ride_minutes=20)  # 最早 17:20 到桃園站
    RET = Leg(at=t(22, 28), fare=30, ride_minutes=25)  # 最晚 22:28 要離開影城
    COND = replace(COND, order="meal_first")

    def test_times_and_buffers(self):
        c = check_meal_first(self.SHOW, REST, WALK, self.GO, self.RET, self.COND)
        assert not isinstance(c, Rejected)
        assert c.arrive_hub == t(17, 20)
        assert c.arrive_restaurant == t(17, 25)
        assert c.meal_start == t(17, 35)
        assert c.meal_end == t(18, 20)
        assert c.arrive_cinema == t(18, 23)
        assert c.buffers.showtime == 12  # 18:35 − 18:23
        assert c.buffers.last_order == 205  # 21:00 − 17:35
        # 先吃飯：回程看影城，最晚 22:28 要離開，散場 20:49
        assert c.leave_area_at == t(20, 49)
        assert c.buffers.return_trip == 99
        assert c.min_buffer == 12
        assert c.cost.total == 350 + 150 + 25 + 30

    def test_showtime(self):
        show = replace(self.SHOW, starts_at=t(18, 37), ends_at=t(20, 36))
        result = check_meal_first(show, REST, WALK, self.GO, self.RET, self.COND)
        assert result == Rejected("showtime")

    def test_last_train(self):
        ret = replace(self.RET, at=t(20, 48))
        result = check_meal_first(self.SHOW, REST, WALK, self.GO, ret, self.COND)
        assert result == Rejected("last_train")

    def test_waits_for_opening_shifts_everything_later(self):
        # 17:25 到店、候位到 17:35；店 17:45 開 → 17:45 開始吃，18:30 吃完，18:33 到影城
        rest = replace(REST, hours=OpeningHours.parse("Mo-Su 17:45-22:00"))
        c = check_meal_first(self.SHOW, rest, WALK, self.GO, self.RET, self.COND)
        assert c.meal_start == t(17, 45)
        assert c.arrive_cinema == t(18, 33)
        assert c.buffers.showtime == 2

    def test_opening_hours(self):
        rest = replace(REST, hours=OpeningHours.parse("Mo-Su 18:10-22:00"))
        result = check_meal_first(self.SHOW, rest, WALK, self.GO, self.RET, self.COND)
        assert result == Rejected("opening_hours")


class TestFilterAll:
    def make_showtimes(self):
        # 31 號片三個場次，間隔 30 分鐘；40 號片一個場次
        shows = [
            Showtime(
                id=i,
                movie_id=31,
                cinema_id=3,
                starts_at=t(17, 55) + timedelta(minutes=30 * i),
                ends_at=t(19, 54) + timedelta(minutes=30 * i),
                ticket=350,
            )
            for i in range(3)
        ]
        shows.append(
            Showtime(
                id=9, movie_id=40, cinema_id=3, starts_at=t(17, 50), ends_at=t(19, 30), ticket=350
            )
        )
        return shows

    def test_counts_add_up_and_duplicates_collapse(self):
        shows = self.make_showtimes()
        far = replace(REST, id=46)
        closed = replace(REST, id=47, hours=OpeningHours.parse("Mo-Su 11:00-14:00"))
        walk = {(3, 45): 3, (3, 46): 20, (3, 47): 3}
        result = filter_all(
            shows, [REST, far, closed], walk, {("cinema", 3): GO}, {("hub", 1): RET}, COND
        )

        assert result.combinations == 12
        assert result.feasible_count + sum(result.reasons.values()) == 12
        # 18:55 場 20:07＋60 開始用餐 → 21:07，過了最後點餐
        assert result.reasons == {"walk": 4, "opening_hours": 4, "last_order": 1}
        # 31 號片的兩個可行場次接同一家，只留一組
        pairs = sorted((c.showtime.movie_id, c.restaurant.id) for c in result.feasible)
        assert pairs == [(31, 45), (40, 45)]
        assert result.feasible_count == 3
        assert result.showtimes_by_movie == {31: 2, 40: 1}

    def test_keeps_showtime_with_largest_min_buffer(self):
        result = filter_all(
            self.make_showtimes(),
            [REST],
            {(3, 45): 3},
            {("cinema", 3): GO},
            {("hub", 1): RET},
            COND,
        )
        best = next(c for c in result.feasible if c.showtime.movie_id == 31)
        # 17:55 場：showtime 10；18:25 場：showtime 40、last_order 23 → 取 18:25 場
        assert best.showtime.id == 1
        assert best.min_buffer == 23

    def test_reasons_only_list_nonzero_in_spec_order(self):
        result = filter_all(
            self.make_showtimes(), [REST], {(3, 45): 3}, {}, {("hub", 1): RET}, COND
        )
        assert result.feasible == []
        assert list(result.reasons) == ["showtime"]

    @pytest.mark.parametrize("order", ["movie_first", "meal_first"])
    def test_uses_reach_and_leave_keys_for_order(self, order):
        cond = replace(COND, order=order)
        if order == "movie_first":
            reach, leave = {("cinema", 3): GO}, {("hub", 1): RET}
        else:
            reach = {("hub", 1): Leg(at=t(16, 30), fare=25)}
            leave = {("cinema", 3): RET}
        result = filter_all([SHOW], [REST], {(3, 45): 3}, reach, leave, cond)
        assert result.feasible_count == 1
