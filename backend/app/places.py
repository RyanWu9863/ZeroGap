"""Google Places API (New)（規格書 3.3、7.1 步驟 5、7.2）。

格式照官方文件（2026-10-21 查證，金鑰到了再實測）：
- 店家資料：`GET https://places.googleapis.com/v1/places/{place_id}`
- 附近搜尋：`POST .../places:searchNearby`
- 金鑰放 `X-Goog-Api-Key`；要的欄位一定要寫在 `X-Goog-FieldMask`（逗號分隔、不能有空白），
  費用依欄位中最高的等級計：店名 Pro、地址和座標 Essentials、營業時間和價位 Enterprise
- 營業時間 `periods[].open/close` 的 `day` 是 0（星期日）～6；24 小時營業的店沒有 `close`
- 附近搜尋一次最多 20 筆，沒有分頁

**條款**：只有 `place_id` 可以長期保存，座標最多 30 天；店名、地址、營業時間只放在記憶體。
"""

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.planning.opening_hours import OpeningHours

DETAILS_URL = "https://places.googleapis.com/v1/places"
NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby"
LANGUAGE = {"languageCode": "zh-TW", "regionCode": "TW"}
ENTERPRISE_FIELDS = "displayName,formattedAddress,regularOpeningHours,priceLevel"
PRO_FIELDS = "displayName,formattedAddress"
NEARBY_FIELDS = ",".join(
    f"places.{f}"
    for f in ("id", "displayName", "types", "primaryType", "formattedAddress", "location",
              "priceLevel", "businessStatus")
)  # fmt: skip
# Google 的價位等級 → 我們的價位區間【預設】
PRICE_LEVELS = {
    "PRICE_LEVEL_FREE": "under_200",
    "PRICE_LEVEL_INEXPENSIVE": "under_200",
    "PRICE_LEVEL_MODERATE": "200_500",
    "PRICE_LEVEL_EXPENSIVE": "500_1000",
    "PRICE_LEVEL_VERY_EXPENSIVE": "over_1000",
}
MEAL_TYPES = ["restaurant", "fast_food_restaurant", "cafe"]


class PlacesError(Exception):
    pass


@dataclass(frozen=True)
class PlaceDetails:
    name: str | None
    address: str | None
    hours: OpeningHours | None = None  # 只有 Enterprise 等級才有
    price_range: str | None = None


@dataclass(frozen=True)
class NearbyPlace:
    """附近搜尋的結果。店名、類型只給屬性判斷用，不能存進資料庫。"""

    place_id: str
    name: str | None
    lat: float
    lng: float
    primary_type: str | None
    types: tuple[str, ...]
    price_range: str | None


class Places(Protocol):
    def details(self, place_id: str) -> PlaceDetails:
        """Enterprise：店名、地址、營業時間、價位。規劃時補前三名用。"""
        ...

    def basic(self, place_id: str) -> PlaceDetails:
        """Pro：店名、地址。備選餐廳用。"""
        ...


def price_range_from_level(level: str | None) -> str | None:
    return PRICE_LEVELS.get(level or "")


def hours_from_periods(periods: list[dict[str, Any]] | None) -> OpeningHours | None:
    """Google 的營業時段 → OpeningHours（星期一到星期日；跨夜時結束超過 24:00）。"""
    if not periods:
        return None
    if len(periods) == 1 and "close" not in periods[0]:
        return OpeningHours(by_weekday=tuple(((0, 1440),) for _ in range(7)))  # 24 小時
    week: list[list[tuple[int, int]]] = [[] for _ in range(7)]
    for p in periods:
        o, c = p.get("open"), p.get("close")
        if not o or not c:
            continue
        start = o.get("hour", 0) * 60 + o.get("minute", 0)
        days_later = (c["day"] - o["day"]) % 7
        end = days_later * 1440 + c.get("hour", 0) * 60 + c.get("minute", 0)
        if end <= start:
            end += 7 * 1440 if days_later == 0 else 0
        week[(o["day"] - 1) % 7].append((start, end))  # Google 的 0 是星期日
    return OpeningHours(by_weekday=tuple(tuple(sorted(spans)) for spans in week))


class GooglePlaces:
    def __init__(
        self,
        api_key: str,
        timeout: float = 10.0,
        retries: int = 2,
        http: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        if not api_key:
            raise PlacesError("GOOGLE_MODE=real 要先在 .env 填 GOOGLE_PLACES_API_KEY")
        self.api_key = api_key
        self.retries = retries
        self.http = http or httpx.Client(timeout=timeout)
        self.sleep = sleep

    def _request(self, method: str, url: str, fields: str, **kwargs: Any) -> dict[str, Any]:
        """8.3：逾時或 5xx 最多重試 2 次；4xx 不重試。"""
        headers = {"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": fields}
        for attempt in range(self.retries + 1):
            try:
                resp = self.http.request(method, url, headers=headers, **kwargs)
            except httpx.TimeoutException:
                if attempt == self.retries:
                    raise PlacesError("Google Places 逾時") from None
                self.sleep(attempt + 1)
                continue
            if resp.status_code >= 500 and attempt < self.retries:
                self.sleep(attempt + 1)
                continue
            if resp.status_code != 200:
                raise PlacesError(f"Google Places HTTP {resp.status_code}：{resp.text[:200]}")
            return resp.json()
        raise PlacesError("Google Places 失敗")

    def _details(self, place_id: str, fields: str) -> dict[str, Any]:
        return self._request("GET", f"{DETAILS_URL}/{place_id}", fields, params=LANGUAGE)

    def details(self, place_id: str) -> PlaceDetails:
        d = self._details(place_id, ENTERPRISE_FIELDS)
        return PlaceDetails(
            name=(d.get("displayName") or {}).get("text"),
            address=d.get("formattedAddress"),
            hours=hours_from_periods((d.get("regularOpeningHours") or {}).get("periods")),
            price_range=price_range_from_level(d.get("priceLevel")),
        )

    def basic(self, place_id: str) -> PlaceDetails:
        d = self._details(place_id, PRO_FIELDS)
        return PlaceDetails(name=(d.get("displayName") or {}).get("text"),
                            address=d.get("formattedAddress"))  # fmt: skip

    def location(self, place_id: str) -> tuple[float, float] | None:
        """Essentials：座標超過 25 天就更新（條款上限 30 天）。"""
        loc = self._details(place_id, "location").get("location")
        return (loc["latitude"], loc["longitude"]) if loc else None

    def nearby(self, lat: float, lng: float, radius_m: float) -> list[NearbyPlace]:
        body = {
            # 只收「主要類型」是餐廳類的店（2026-10-21 使用者決定），排除順便標成餐廳的麵包店等
            # 官方文件：指定一般類型時，也會包含更細的主要類型（例如 chinese_restaurant）
            "includedPrimaryTypes": MEAL_TYPES,
            "maxResultCount": 20,
            "locationRestriction": {
                "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": float(radius_m)}
            },
            **LANGUAGE,
        }
        data = self._request("POST", NEARBY_URL, NEARBY_FIELDS, json=body)
        out = []
        for p in data.get("places", []):
            if p.get("businessStatus", "OPERATIONAL") != "OPERATIONAL" or "location" not in p:
                continue
            out.append(
                NearbyPlace(
                    place_id=p["id"],
                    name=(p.get("displayName") or {}).get("text"),
                    lat=p["location"]["latitude"],
                    lng=p["location"]["longitude"],
                    primary_type=p.get("primaryType"),
                    types=tuple(p.get("types", [])),
                    price_range=price_range_from_level(p.get("priceLevel")),
                )
            )
        return out


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
