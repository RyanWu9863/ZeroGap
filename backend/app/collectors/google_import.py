"""Google Places 餐廳 → `restaurants`（規格書 3.3、7.2 的 `refresh_google_places`、4.5）。

- 每個開放商圈的代表點和周圍 6 點，各做一次附近搜尋（一次最多 20 筆、沒有分頁）【預設】
- 只存 `place_id` 和座標（座標記取得時間，25 天就更新，條款上限 30 天）；店名只放在記憶體
- 商圈依距離歸到最近的代表點（跟 OSM 一樣，1,500 公尺內）
- 屬性：Google 的類型和價位能判斷的先判斷，其他交給 LLM（Jev 金鑰到之前）
- 每次搜尋前檢查每月額度（Nearby Search 是 Enterprise，950 次）
"""

import logging
import math
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any, Protocol
from zoneinfo import ZoneInfo

import redis
from sqlalchemy import text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.collectors.osm import RADIUS_M, assign_areas
from app.collectors.osm_import import FIELDS, Judge, _record, load_hubs
from app.models import Restaurant
from app.places import NearbyPlace, PlacesError
from app.redis_utils.quota import add_usage, has_room

log = logging.getLogger(__name__)
TZ = ZoneInfo("Asia/Taipei")
SEARCH_RADIUS_M = 700
CENTER_STEP_M = 900
GEOM_MAX_AGE = timedelta(days=25)
GEOM_TERMS_LIMIT = timedelta(days=30)  # 條款上限：座標最多保存 30 天（3.3）
# 每天 03:00 跑一次：超過 29 天的，明天再試就超過條款上限，這次更新不了就要停用
GEOM_LAST_CHANCE = GEOM_TERMS_LIMIT - timedelta(days=1)

# Google 的店家類型 → 料理類別【預設】
GOOGLE_CUISINES = {
    **dict.fromkeys(["japanese_restaurant", "sushi_restaurant", "ramen_restaurant"], "japanese"),
    **dict.fromkeys(["chinese_restaurant", "dim_sum_restaurant"], "chinese"),
    "korean_restaurant": "korean",
    **dict.fromkeys(["american_restaurant", "hamburger_restaurant", "steak_house",
                     "barbecue_restaurant"], "american"),
    **dict.fromkeys(["italian_restaurant", "pizza_restaurant", "french_restaurant",
                     "mediterranean_restaurant", "spanish_restaurant", "greek_restaurant"],
                    "western"),
    **dict.fromkeys(["thai_restaurant", "vietnamese_restaurant", "indian_restaurant",
                     "mexican_restaurant", "indonesian_restaurant", "middle_eastern_restaurant",
                     "turkish_restaurant", "vegetarian_restaurant", "vegan_restaurant"], "other"),
}  # fmt: skip


class NearbyClient(Protocol):
    def nearby(self, lat: float, lng: float, radius_m: float) -> list[NearbyPlace]: ...


class LocationClient(Protocol):
    def location(self, place_id: str) -> tuple[float, float] | None: ...


def centers_around(
    lat: float, lng: float, step_m: float = CENTER_STEP_M
) -> list[tuple[float, float]]:
    """代表點本身＋周圍六角形的 6 點。"""
    out = [(lat, lng)]
    for k in range(6):
        a = math.radians(60 * k)
        out.append(
            (
                lat + step_m * math.cos(a) / 111_320,
                lng + step_m * math.sin(a) / (111_320 * math.cos(math.radians(lat))),
            )
        )
    return out


def rule_attributes_google(
    primary_type: str | None, types: tuple[str, ...], price_range: str | None
) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for t in (primary_type, *types):
        if t in GOOGLE_CUISINES:
            attrs["category_code"] = GOOGLE_CUISINES[t]
            break
    if primary_type == "fast_food_restaurant" or "fast_food_restaurant" in types[:1]:
        attrs["meal_duration"] = "fast"
        attrs.setdefault("price_range", price_range or "under_200")
    if price_range:
        attrs["price_range"] = price_range
    return attrs


def refresh_google_places(
    session: Session,
    r: redis.Redis,
    google: NearbyClient,
    judge: Judge,
    quota_limit: int,
    keep_alive: Callable[[], None] = lambda: None,
) -> dict[str, Any]:
    hubs = load_hubs(session)
    found: dict[str, NearbyPlace] = {}
    stats: dict[str, Any] = {"searches": 0, "quota_exhausted": False}
    for hub in hubs:
        for lat, lng in centers_around(hub.lat, hub.lng):
            if not has_room(r, "google:nearby_enterprise", quota_limit):
                stats["quota_exhausted"] = True
                break
            places = google.nearby(lat, lng, SEARCH_RADIUS_M)
            add_usage(r, "google:nearby_enterprise", 1)
            stats["searches"] += 1
            for p in places:
                found.setdefault(p.place_id, p)
        keep_alive()
        if stats["quota_exhausted"]:
            break

    assigned = assign_areas(list(found.values()), hubs, RADIUS_M)
    now = datetime.now(TZ)
    stats["upserted"] = len(assigned)
    judged = failed = 0
    for p, area_id in assigned:
        stmt = insert(Restaurant).values(
            source="google", external_id=p.place_id, geom=f"SRID=4326;POINT({p.lng} {p.lat})",
            geom_fetched_at=now, area_id=area_id, is_active=True,
        )  # fmt: skip
        row = session.execute(
            stmt.on_conflict_do_update(
                index_elements=["source", "external_id"],
                set_={"geom": stmt.excluded.geom, "geom_fetched_at": now, "area_id": area_id,
                      "is_active": True, "updated_at": text("now()")},
            ).returning(Restaurant.id, *[getattr(Restaurant, f) for f in FIELDS])
        ).one()  # fmt: skip
        missing = [f for f in FIELDS if getattr(row, f) is None]
        if not missing:
            continue
        values: dict[str, Any] = {}
        for field, value in rule_attributes_google(p.primary_type, p.types, p.price_range).items():
            if field in missing:
                values[field] = value
                _record(session, row.id, field, value, "rule", "google-types")
        ask = [f for f in missing if f not in values]
        if ask:
            # 店名、類型只放在記憶體給判斷用，不存（3.3）
            answer = judge.judge(p.name or "", {"amenity": p.primary_type or "restaurant",
                                                "cuisine": ";".join(p.types)}, ask)  # fmt: skip
            for field, value in answer.items():
                values[field] = value
                _record(session, row.id, field, value, "llm", judge.model)
            failed += any(f not in answer for f in ask)
        if values:
            session.execute(update(Restaurant).where(Restaurant.id == row.id).values(**values))
        judged += 1
        if judged % 20 == 0:
            session.commit()
            keep_alive()
    session.commit()
    stats.update({"judged": judged, "judge_failed": failed})
    return stats


def refresh_google_geom(
    session: Session, r: redis.Redis, google: LocationClient, quota_limit: int
) -> dict[str, Any]:
    """座標超過 25 天就用 Place Details（Essentials）更新（4.5）。

    Google 回 404（place ID 過時）或沒有座標：清掉座標、設成停用。
    暫時的錯誤（逾時、連不上、5xx、429 等）：這次跳過，明天再試；明天再試就會超過 30 天
    （條款上限）的，才清掉座標、停用（2026-10-27 使用者決定，bug 清單 L1）。
    """
    now = datetime.now(TZ)
    rows = session.execute(
        text(
            "SELECT id, external_id, geom_fetched_at FROM restaurants "
            "WHERE source = 'google' AND is_active "
            "AND (geom_fetched_at IS NULL OR geom_fetched_at < :c) ORDER BY geom_fetched_at"
        ),
        {"c": now - GEOM_MAX_AGE},
    ).all()
    stats: dict[str, Any] = {
        "refreshed": 0, "deactivated": 0, "retry_later": 0, "quota_exhausted": False,
    }  # fmt: skip
    for row in rows:
        if not has_room(r, "google:details_essentials", quota_limit):
            stats["quota_exhausted"] = True
            break
        try:
            loc = google.location(row.external_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("更新 %s 的座標失敗：%r", row.external_id, exc)
            loc = None
            gone = isinstance(exc, PlacesError) and exc.status == 404
            expired = row.geom_fetched_at is None or row.geom_fetched_at <= now - GEOM_LAST_CHANCE
            if not gone and not expired:
                add_usage(r, "google:details_essentials", 1)
                stats["retry_later"] += 1
                continue
        add_usage(r, "google:details_essentials", 1)
        if loc:
            session.execute(
                text(
                    "UPDATE restaurants SET geom = ST_GeogFromText(:w), geom_fetched_at = now() "
                    "WHERE id = :i"
                ),
                {"w": f"SRID=4326;POINT({loc[1]} {loc[0]})", "i": row.id},
            )
            stats["refreshed"] += 1
        else:
            session.execute(
                text("UPDATE restaurants SET geom = NULL, is_active = false WHERE id = :i"),
                {"i": row.id},
            )
            stats["deactivated"] += 1
    session.commit()
    return stats
