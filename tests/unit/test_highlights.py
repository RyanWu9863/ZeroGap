"""特色標籤的分配（規格書 6.5）。"""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.planning.highlights import PlanMetrics, assign_highlights

TZ = ZoneInfo("Asia/Taipei")


def m(cost: int, buffer: int, home: tuple[int, int], walk: int) -> PlanMetrics:
    return PlanMetrics(
        cost_total=cost,
        min_buffer=buffer,
        home_at=datetime(2026, 10, 22, *home, tzinfo=TZ),
        walk_minutes_total=walk,
    )


def keys(highlights):
    return [h["key"] if h else None for h in highlights]


def test_first_is_always_recommended():
    # 第一名其實什麼都最好，也還是 recommended
    plans = [m(400, 50, (21, 0), 5), m(500, 20, (21, 40), 15), m(600, 30, (21, 10), 8)]
    hs = assign_highlights(plans, station="中壢")
    assert hs[0] == {"key": "recommended", "label": "最推薦", "reason": "最符合你選的條件"}
    assert keys(hs) == ["recommended", None, None]


def test_second_and_third_follow_priority():
    plans = [m(550, 10, (21, 25), 13), m(500, 20, (21, 40), 15), m(600, 30, (21, 10), 8)]
    hs = assign_highlights(plans, station="中壢")
    assert keys(hs) == ["recommended", "cheapest", "safest"]
    assert hs[1]["reason"] == "每人 500 元，三個方案中最便宜"
    assert hs[2]["reason"] == "最緊的空檔也有 30 分鐘"


def test_used_key_moves_to_next():
    # 第二、三名同樣最便宜：第二名拿走「最省」，第三名改拿它最好的下一項
    plans = [m(550, 10, (21, 25), 13), m(500, 20, (21, 40), 15), m(500, 5, (21, 10), 20)]
    hs = assign_highlights(plans, station="中壢")
    assert keys(hs) == ["recommended", "cheapest", "earliest_return"]
    assert hs[2]["reason"] == "21:10 就回到中壢"


def test_tie_counts_as_best():
    plans = [m(500, 30, (21, 25), 13), m(500, 10, (21, 40), 15), m(600, 5, (22, 0), 20)]
    hs = assign_highlights(plans, station="中壢")
    assert keys(hs)[1] == "cheapest"


def test_shortest_walk():
    plans = [m(500, 30, (21, 0), 13), m(600, 10, (21, 40), 6), m(700, 5, (22, 0), 20)]
    hs = assign_highlights(plans, station="中壢")
    assert keys(hs) == ["recommended", "shortest_walk", None]
    assert hs[1]["reason"] == "全程步行約 6 分鐘"


def test_two_plans_and_one_plan():
    hs = assign_highlights([m(550, 10, (21, 25), 13), m(500, 20, (21, 40), 15)], station="中壢")
    assert hs[1]["reason"] == "每人 500 元，兩個方案中最便宜"
    assert keys(assign_highlights([m(550, 10, (21, 25), 13)], station="中壢")) == ["recommended"]
