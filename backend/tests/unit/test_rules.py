from datetime import time

import pytest

from app.planning.rules import (
    TICKET_PRICES_2026_10,
    estimate_ticket,
    last_order,
    max_straight_meters,
    meal_cost,
    round_half_up,
    walk_minutes,
)


class TestWalk:
    def test_zero(self):
        assert walk_minutes(0) == 0

    def test_rounds_up(self):
        # 300 × 1.3 ÷ 75 = 5.2 → 6
        assert walk_minutes(300) == 6

    def test_exact_minute_is_not_rounded_up(self):
        # 75 ÷ 1.3 公尺剛好 1 分鐘，浮點誤差不能讓它變成 2
        assert walk_minutes(75 / 1.3) == 1

    def test_max_straight_meters_is_inverse(self):
        assert max_straight_meters(12) == pytest.approx(12 * 75 / 1.3)
        assert walk_minutes(max_straight_meters(12)) == 12


class TestTicket:
    def test_round_half_up_not_bankers(self):
        assert round_half_up(325, 10) == 330
        assert round_half_up(324, 10) == 320

    def test_vieshow_standard(self):
        assert estimate_ticket("vieshow", "standard", TICKET_PRICES_2026_10) == 350

    def test_vieshow_imax(self):
        # 400～470 → 435 → 440
        assert estimate_ticket("vieshow", "imax", TICKET_PRICES_2026_10) == 440

    def test_special_hall_falls_back_to_chain_standard(self):
        # 秀泰沒有 imax → 秀泰一般廳 310～400 → 355 → 360
        assert estimate_ticket("showtime", "imax", TICKET_PRICES_2026_10) == 360

    def test_unknown_chain_uses_default(self):
        # default 300～350 → 325 → 330
        assert estimate_ticket(None, "standard", TICKET_PRICES_2026_10) == 330
        assert estimate_ticket(None, "imax", TICKET_PRICES_2026_10) == 330

    def test_single_price(self):
        assert estimate_ticket("skcinemas", "dolby", TICKET_PRICES_2026_10) == 480


class TestMeal:
    @pytest.mark.parametrize(
        ("price_range", "cost"),
        [("under_200", 150), ("200_500", 350), ("500_1000", 750), ("over_1000", 1200)],
    )
    def test_meal_cost(self, price_range, cost):
        assert meal_cost(price_range) == cost

    def test_unknown_price_range_uses_middle(self):
        assert meal_cost(None) == 350

    def test_last_order(self):
        assert last_order(time(21, 30)) == time(21, 0)
        assert last_order(time(0, 15)) == time(23, 45)
