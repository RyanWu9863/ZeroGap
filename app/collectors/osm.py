"""OSM（Overpass API）餐廳 → `restaurants`（規格書 3、7.2，討論紀錄「第二階段開始前的查證」）。

- 每個開放商圈的代表點周圍 1,500 公尺，一次查詢涵蓋全部（不同時送多個請求）
- 商圈：離哪個代表點最近、而且在 1,500 公尺內（2026-10-20 決定，不交給 Jev）
- 屬性：有標籤的照標籤對應（2026-10-20 決定），其他交給 LLM（見 `app.judge`）
- 只賣飲料、甜點、麵包的店不收【預設】：這是排「吃飯」的行程
- 使用規範：要帶 User-Agent；429 或 504 時等 30 秒再試；每天一次
- 出處：顯示時要標「© OpenStreetMap contributors」，連到 https://www.openstreetmap.org/copyright
"""

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

from app.transit import haversine_m

log = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "ZeroGap/0.1 (student project; daily restaurant import)"
AMENITIES = ("restaurant", "fast_food", "cafe")
RADIUS_M = 1500

# OSM cuisine 值 → 我們的料理類別。依實際出現的值整理（2026-10-20 中壢站周圍）【預設】
CUISINE_MAP: dict[str, str] = {
    **dict.fromkeys(
        ["japanese", "sushi", "ramen", "udon", "beef_bowl", "izakaya", "tonkatsu", "yakiniku",
         "teppanyaki", "鐵板燒", "壽司", "拉麵", "丼飯", "燒肉", "日式"],
        "japanese",
    ),
    **dict.fromkeys(
        ["chinese", "taiwanese", "cantonese", "sichuan", "dim_sum", "dumplings", "noodle",
         "beef_noodle", "hot_pot", "hotpot", "火鍋", "麻辣鍋", "鴛鴦鍋", "小吃", "熱炒", "台菜",
         "中式", "麵食", "rice"],
        "chinese",
    ),
    **dict.fromkeys(["korean", "韓式"], "korean"),
    **dict.fromkeys(
        ["burger", "american", "steak_house", "steak", "chicken", "fried_chicken", "bbq",
         "barbecue", "diner", "美式", "牛排"],
        "american",
    ),
    **dict.fromkeys(
        ["italian", "pizza", "pasta", "french", "spanish", "european", "western",
         "mediterranean", "german", "義式", "西式"],
        "western",
    ),
}  # fmt: skip
# 只賣飲料、甜點、麵包：不是一餐
DRINK_VALUES = frozenset(
    ["bubble_tea", "coffee_shop", "tea", "juice", "ice_cream", "frozen_yogurt", "dessert",
     "cake", "bakery", "bread", "donut", "crepe", "麵包", "蛋糕", "甜點", "飲料", "手搖飲"]
)  # fmt: skip
# 沒對到上面、但確定是一餐的值，歸到「其他」
OTHER_MEAL_VALUES = frozenset(
    ["thai", "vietnamese", "malaysian", "indian", "mexican", "singaporean", "indonesian",
     "middle_eastern", "turkish", "新加坡", "泰式", "越式", "印度", "vegetarian", "vegan"]
)  # fmt: skip


@dataclass(frozen=True)
class Hub:
    id: int
    area_id: int
    name: str
    lat: float
    lng: float


@dataclass(frozen=True)
class OsmPlace:
    external_id: str  # node/123、way/456
    name: str
    lat: float
    lng: float
    tags: dict[str, str]

    @property
    def opening_hours(self) -> str | None:
        return self.tags.get("opening_hours")


def build_query(hubs: list[Hub], radius_m: int = RADIUS_M) -> str:
    pattern = "|".join(AMENITIES)
    parts = "\n".join(
        f'  nwr["amenity"~"^({pattern})$"](around:{radius_m},{h.lat},{h.lng});' for h in hubs
    )
    return f"[out:json][timeout:90];\n(\n{parts}\n);\nout center tags;"


def parse_elements(payload: dict[str, Any]) -> list[OsmPlace]:
    places: dict[str, OsmPlace] = {}
    for e in payload.get("elements", []):
        tags = e.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        lat = e.get("lat") or (e.get("center") or {}).get("lat")
        lng = e.get("lon") or (e.get("center") or {}).get("lon")
        if lat is None or lng is None:
            continue
        external_id = f"{e['type']}/{e['id']}"
        places[external_id] = OsmPlace(external_id, name, float(lat), float(lng), tags)
    return list(places.values())


def _values(cuisine: str | None) -> list[str]:
    return [v.strip().lower() for v in (cuisine or "").split(";") if v.strip()]


def cuisine_from_tags(cuisine: str | None) -> str | None:
    """取第一個對得上的值；只有飲料類、或完全對不上的回傳 None（交給 LLM）。"""
    values = _values(cuisine)
    for v in values:
        if v in CUISINE_MAP:
            return CUISINE_MAP[v]
    if any(v in OTHER_MEAL_VALUES for v in values):
        return "other"
    return None


def is_drink_shop(tags: dict[str, str]) -> bool:
    values = _values(tags.get("cuisine"))
    return bool(values) and all(v in DRINK_VALUES for v in values)


def rule_attributes(tags: dict[str, str]) -> dict[str, str]:
    """照標籤就能判斷的屬性；判斷不了的不放，交給 LLM。"""
    attrs: dict[str, str] = {}
    cuisine = cuisine_from_tags(tags.get("cuisine"))
    if cuisine:
        attrs["category_code"] = cuisine
    if tags.get("amenity") == "fast_food":
        attrs["meal_duration"] = "fast"
        attrs["price_range"] = "under_200"
    return attrs


def assign_areas(
    places: list[OsmPlace], hubs: list[Hub], radius_m: int = RADIUS_M
) -> list[tuple[OsmPlace, int]]:
    """每家店歸到最近的代表點所屬的商圈；最近的代表點也超過範圍就不收。"""
    out = []
    for p in places:
        dist, hub = min(((haversine_m(p.lat, p.lng, h.lat, h.lng), h) for h in hubs),
                        key=lambda x: x[0])  # fmt: skip
        if dist <= radius_m:
            out.append((p, hub.area_id))
    return out


def fetch(
    query: str,
    http: httpx.Client | None = None,
    retries: int = 2,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    client = http or httpx.Client(timeout=120, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries + 1):
        try:
            resp = client.post(OVERPASS_URL, data={"data": query})
        except httpx.TimeoutException:
            if attempt == retries:
                raise
            sleep(30)
            continue
        if resp.status_code in (429, 504) and attempt < retries:
            sleep(30)  # Overpass 的規範：被擋時等 30 秒
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError("Overpass 查詢失敗")
