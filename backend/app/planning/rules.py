"""時間、步行、票價、餐費的規則（規格書 4.3、7.1、7.3）。

預設值跟 `app.config.Settings` 相同；planner 會把設定值傳進來，這裡不讀設定，方便測試。
"""

import math
from datetime import datetime, time, timedelta

WALK_DETOUR_FACTOR = 1.3
WALK_METERS_PER_MINUTE = 75.0
LAST_ORDER_BEFORE_CLOSE_MINUTES = 30
TICKET_ROUND_TO = 10

MEAL_COST_BY_PRICE_RANGE = {"under_200": 150, "200_500": 350, "500_1000": 750, "over_1000": 1200}
# Jev 還沒判斷出價位時，用中間的「200～500」【預設】
UNKNOWN_PRICE_RANGE = "200_500"

# (品牌, 影廳) → (最低, 最高)。資料庫的 ticket_prices 有同樣的內容，這份給測試和種子資料用。
TICKET_PRICES_2026_10: dict[tuple[str, str], tuple[int, int]] = {
    ("vieshow", "standard"): (300, 400),
    ("vieshow", "imax"): (400, 470),
    ("vieshow", "4dx"): (520, 570),
    ("vieshow", "titan"): (270, 340),
    ("showtime", "standard"): (310, 400),
    ("showtime", "screenx"): (420, 520),
    ("showtime", "4dx"): (550, 610),
    ("ambassador", "standard"): (290, 320),
    ("ambassador", "dbox"): (530, 580),
    ("ambassador", "premium"): (390, 440),
    ("skcinemas", "standard"): (310, 370),
    ("skcinemas", "dolby"): (480, 480),
    ("skcinemas", "mx4d"): (560, 560),
    ("in89", "standard"): (300, 340),
    ("in89", "imax"): (420, 420),
    ("in89", "mx4d"): (530, 530),
    ("default", "standard"): (300, 350),
}

# 浮點誤差的容忍值：剛好整數分鐘的距離不能被進位成下一分鐘
_EPS = 1e-9


def walk_minutes(
    straight_meters: float,
    detour: float = WALK_DETOUR_FACTOR,
    meters_per_minute: float = WALK_METERS_PER_MINUTE,
) -> int:
    """直線距離 × 繞路係數 ÷ 步行速度，無條件進位。"""
    return max(0, math.ceil(straight_meters * detour / meters_per_minute - _EPS))


def max_straight_meters(
    minutes: int,
    detour: float = WALK_DETOUR_FACTOR,
    meters_per_minute: float = WALK_METERS_PER_MINUTE,
) -> float:
    """步行 `minutes` 分鐘以內的最大直線距離，給 PostGIS 的 ST_DWithin 用。"""
    return minutes * meters_per_minute / detour


def round_half_up(value: float, unit: int) -> int:
    """四捨五入到 `unit`。Python 的 round() 是銀行家捨入（325 → 320），這裡要 330。"""
    return int(math.floor(value / unit + 0.5)) * unit


def estimate_ticket(
    chain: str | None,
    hall_type: str,
    prices: dict[tuple[str, str], tuple[int, int]],
    round_to: int = TICKET_ROUND_TO,
) -> int:
    """估計全票價：品牌＋影廳 → 品牌的一般廳 → default，取區間中間值。"""
    for key in ((chain, hall_type), (chain, "standard"), ("default", "standard")):
        if key[0] is not None and key in prices:
            low, high = prices[key]
            return round_half_up((low + high) / 2, round_to)
    raise KeyError("ticket_prices 缺少 ('default', 'standard')")


def meal_cost(price_range: str | None, table: dict[str, int] = MEAL_COST_BY_PRICE_RANGE) -> int:
    return table[price_range if price_range in table else UNKNOWN_PRICE_RANGE]


def last_order(close: time, minutes: int = LAST_ORDER_BEFORE_CLOSE_MINUTES) -> time:
    """最後點餐 = 打烊前 `minutes` 分鐘。"""
    return (
        datetime.combine(datetime.min.date() + timedelta(days=1), close)
        - timedelta(minutes=minutes)
    ).time()


def minutes_between(earlier: datetime, later: datetime) -> int:
    """later − earlier 的分鐘數，無條件捨去。所有緩衝都用這個算。"""
    return math.floor((later - earlier).total_seconds() / 60)
