"""規劃純邏輯用的資料型別。不碰資料庫和網路，planner 會把資料轉成這些型別。

時間一律是帶時區的 datetime（Asia/Taipei）。金額是每人、新台幣。
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.planning.opening_hours import OpeningHours

Order = Literal["movie_first", "meal_first"]

# 被排除的原因，也是檢查順序（規格書 6.4）
REASONS = ("showtime", "walk", "opening_hours", "last_order", "last_train", "budget")
Reason = Literal["showtime", "walk", "opening_hours", "last_order", "last_train", "budget"]

# 步驟 2 的查詢對象：("cinema", id) 或 ("hub", id)
PlaceKey = tuple[Literal["cinema", "hub"], int]


@dataclass(frozen=True)
class Showtime:
    id: int
    movie_id: int
    cinema_id: int
    starts_at: datetime
    ends_at: datetime
    ticket: int  # 估計票價（4.3）
    hall_type: str = "standard"
    language: str | None = None


@dataclass(frozen=True)
class Restaurant:
    id: int
    hub_id: int  # 最近的商圈代表點
    walk_to_hub: int  # 走到代表點幾分鐘
    meal_minutes: int
    meal_cost: int
    hours: OpeningHours | None = None  # None：不知道（Google 來源要到步驟 5 才驗證）


@dataclass(frozen=True)
class Leg:
    """步驟 2 的 TDX 結果。

    去程：`at` 是最早幾點能抵達；回程：`at` 是最晚幾點要離開。
    `ride_minutes` 是不含等車的交通時間，給備選估計到家時間用（7.1 步驟 7）。
    """

    at: datetime
    fare: int
    ride_minutes: int = 0


@dataclass(frozen=True)
class Conditions:
    order: Order
    earliest_departure: datetime
    latest_home: datetime
    max_walk_minutes: int
    budget_per_person: int
    arrive_before_showtime: int = 15
    wait_minutes: int = 10
    last_order_before_close: int = 30


@dataclass(frozen=True)
class Buffers:
    """各關卡剩下的分鐘數。`last_order` 在不知道營業時間時是 None。"""

    showtime: int
    last_order: int | None
    return_trip: int

    @property
    def minimum(self) -> int:
        values = [self.showtime, self.return_trip]
        if self.last_order is not None:
            values.append(self.last_order)
        return min(values)


@dataclass(frozen=True)
class Cost:
    ticket: int
    meal: int
    fare_go: int
    fare_return: int

    @property
    def total(self) -> int:
        return self.ticket + self.meal + self.fare_go + self.fare_return


@dataclass(frozen=True)
class Combo:
    """一組接得上的「場次 × 餐廳」。"""

    order: Order
    showtime: Showtime
    restaurant: Restaurant
    walk_cinema_restaurant: int
    arrive_cinema: datetime
    arrive_hub: datetime | None  # 先吃飯：抵達代表點的時間；先看電影是 None
    arrive_restaurant: datetime
    meal_start: datetime
    meal_end: datetime
    leave_area_at: datetime  # 先看電影：走到代表點；先吃飯：散場
    latest_leave: datetime  # 步驟 2 的「最晚要離開」
    last_order_at: datetime | None
    buffers: Buffers
    cost: Cost
    return_ride_minutes: int  # 步驟 2 回程路線的交通時間

    @property
    def min_buffer(self) -> int:
        return self.buffers.minimum

    @property
    def pair(self) -> tuple[int, int]:
        return self.showtime.movie_id, self.restaurant.id


@dataclass(frozen=True)
class Rejected:
    reason: Reason
