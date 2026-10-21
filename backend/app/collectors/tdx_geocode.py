"""TDX 地理編碼（規格書 3.4）：地標名稱、地址 → 座標。

- 進階服務，每次扣 15 單位（5.5），點數不夠就停
- `Geometry` 是 WKT：`POINT (經度 緯度)`（2026-10-20 實測）；預設回 GeoJSON，所以要帶 `$format=JSON`
- 同名的地標可能有好幾個，只取地址在指定縣市的
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import redis
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings
from app.tdx import TdxTransit

_POINT = re.compile(r"POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)", re.IGNORECASE)


@dataclass(frozen=True)
class GeoHit:
    name: str | None
    address: str | None
    lat: float
    lng: float


def parse_point(wkt: str) -> tuple[float, float] | None:
    """回傳 (緯度, 經度)。"""
    m = _POINT.search(wkt or "")
    return (float(m.group(2)), float(m.group(1))) if m else None


def parse_hits(items: list[dict[str, Any]], city: str | None = None) -> list[GeoHit]:
    hits = []
    for x in items or []:
        point = parse_point(x.get("Geometry", ""))
        if point is None:
            continue
        address = x.get("Address")
        if city and address and not address.startswith(city):
            continue
        hits.append(GeoHit(name=x.get("Name") or x.get("Markname"), address=address,
                           lat=point[0], lng=point[1]))  # fmt: skip
    return hits


class Geocoder:
    def __init__(self, tdx: TdxTransit, r: redis.Redis, s: Settings):
        self.tdx, self.r, self.s = tdx, r, s

    def _call(self, kind: str, value: str) -> list[dict[str, Any]]:
        # 限流和點數（每次 15 單位）由 TdxTransit 在每次請求前處理
        return self.tdx.get_advanced(f"/V3/Map/GeoCode/Coordinate/{kind}/{quote(value)}")

    def markname(self, name: str, city: str | None = None) -> list[GeoHit]:
        return parse_hits(self._call("Markname", name), city)

    def address(self, address: str, city: str | None = None) -> list[GeoHit]:
        return parse_hits(self._call("Address", address), city)


def _station_for_hub(session: Session, hub: str, county_id: int) -> tuple[float, float] | None:
    """代表點是車站時，直接用 TDX 車站的座標：「中壢站」→ 台鐵中壢、「高鐵桃園站」→ 高鐵桃園。

    地標名稱是模糊比對，「中壢站」實測會查到「山隆加油站中壢站」，所以車站不查地標。
    """
    if hub.startswith("高鐵") and hub.endswith("站"):
        operator, name = "THSR", hub[2:-1]
    elif hub.endswith("站"):
        operator, name = "TRA", hub[:-1]
    else:
        return None
    row = session.execute(
        text(
            "SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM stations "
            "WHERE operator = :o AND name = :n AND county_id = :c AND is_active LIMIT 1"
        ),
        {"o": operator, "n": name, "c": county_id},
    ).first()
    return (row.lat, row.lng) if row else None


def geocode_hubs(
    session: Session, geocoder: Geocoder, only_missing: bool = True,
    keep_alive: Callable[[], None] = lambda: None,
) -> dict[str, Any]:  # fmt: skip
    """商圈代表點：車站用 TDX 車站的座標；其他用地標名稱查，名稱完全一樣的優先。

    名稱對不上的會列在 `needs_review`，要人工確認。
    """
    rows = session.execute(
        text(
            "SELECT h.id, h.name, c.name AS city, c.id AS county_id FROM area_hubs h "
            "JOIN areas a ON a.id = h.area_id JOIN counties c ON c.id = a.county_id "
            + ("WHERE h.geom IS NULL" if only_missing else "")
        )
    ).all()
    stats: dict[str, Any] = {"updated": [], "not_found": [], "needs_review": []}
    for row in rows:
        station = _station_for_hub(session, row.name, row.county_id)
        if station:
            hit = GeoHit(name=f"車站：{row.name}", address=None, lat=station[0], lng=station[1])
        else:
            hits = geocoder.markname(row.name, row.city)
            if not hits:
                stats["not_found"].append(row.name)
                continue
            exact = [h for h in hits if h.name == row.name]
            hit = (exact or hits)[0]
            if not exact:
                stats["needs_review"].append({"hub": row.name, "found": hit.name,
                                              "address": hit.address})  # fmt: skip
        session.execute(
            text(
                "UPDATE area_hubs SET geom = ST_GeogFromText(:wkt), updated_at = now() "
                "WHERE id = :id"
            ),
            {"wkt": f"SRID=4326;POINT({hit.lng} {hit.lat})", "id": row.id},
        )
        stats["updated"].append({"hub": row.name, "found": hit.name, "address": hit.address,
                                 "lat": hit.lat, "lng": hit.lng})  # fmt: skip
        session.commit()
        keep_alive()
    return stats
