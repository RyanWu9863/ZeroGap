"""Google Place Details 的介面與模擬版（規格書 3.3、7.1 步驟 5）。

真的用戶端第二階段才做（要金鑰）。拿到的店名、地址、營業時間只放在記憶體，不能存進資料庫或 Redis。
示意資料的餐廳 source 是 demo，不會呼叫這裡。
"""

from dataclasses import dataclass
from typing import Protocol

from app.planning.opening_hours import OpeningHours


@dataclass(frozen=True)
class PlaceDetails:
    name: str | None
    address: str | None
    hours: OpeningHours | None = None  # 只有 Enterprise 等級才有


class Places(Protocol):
    def details(self, place_id: str) -> PlaceDetails:
        """Enterprise：店名、地址、營業時間、價位。規劃時補前三名用。"""
        ...

    def basic(self, place_id: str) -> PlaceDetails:
        """Pro：店名、地址。備選餐廳用。"""
        ...


class MockPlaces:
    """模擬版（示意）：每家店都叫「示意 Google 餐廳」，每天 11:00～22:00 營業。"""

    def details(self, place_id: str) -> PlaceDetails:
        return PlaceDetails(
            name=f"示意 Google 餐廳 {place_id[-4:]}",
            address="（示意地址）",
            hours=OpeningHours.parse("Mo-Su 11:00-22:00"),
        )

    def basic(self, place_id: str) -> PlaceDetails:
        return PlaceDetails(name=f"示意 Google 餐廳 {place_id[-4:]}", address="（示意地址）")
