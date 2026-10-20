"""TDX 軌道車站 → `stations`（規格書 3.5、4.3、4.5）。

- 用 v2：v3 的台鐵車站沒有縣市欄位（2026-10-20 查證）
- 縣市用 `LocationCity`（例如「桃園市」）對到 `counties.name`；TDX 的三碼代碼（TAO）跟我們的代碼不同
- 這次抓到的業者，資料裡消失的車站設成停用；真的車站進來後，示意的出發站（demo-）也設成停用
"""

import logging
from collections.abc import Callable
from typing import Any

import redis
from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import County, Station
from app.redis_utils.quota import add_usage, has_room
from app.redis_utils.ratelimit import wait_for_slot
from app.tdx import TdxError, TdxTransit

log = logging.getLogger(__name__)

# 貓空纜車（TRTCMG）不收（3.5）
METRO_SYSTEMS = ("TRTC", "KRTC", "TYMC", "KLRT", "NTDLRT", "TMRT", "NTMC", "NTALRT")
SOURCES: list[tuple[str, str]] = [
    ("TRA", "/v2/Rail/TRA/Station"),
    ("THSR", "/v2/Rail/THSR/Station"),
    *[(m, f"/v2/Rail/Metro/Station/{m}") for m in METRO_SYSTEMS],
]
BASIC_CALL_UNITS = 2  # 基礎服務每次扣 2 單位（5.5）


class QuotaExhausted(Exception):
    pass


def parse_stations(
    items: list[dict[str, Any]], operator: str, counties: dict[str, int]
) -> list[dict[str, Any]]:
    rows = []
    for x in items:
        county_id = counties.get(x.get("LocationCity") or "")
        pos = x.get("StationPosition") or {}
        lat, lng = pos.get("PositionLat"), pos.get("PositionLon")
        if county_id is None or not lat or not lng:
            continue
        rows.append(
            {
                "station_uid": x["StationUID"],
                "operator": operator,
                "name": (x.get("StationName") or {}).get("Zh_tw") or x["StationID"],
                "county_id": county_id,
                "geom": f"SRID=4326;POINT({lng} {lat})",
                "is_active": True,
            }
        )
    return rows


def refresh_stations(
    session: Session,
    r: redis.Redis,
    tdx: TdxTransit,
    s: Settings,
    keep_alive: Callable[[], None] = lambda: None,
) -> dict[str, Any]:
    counties = {name: cid for cid, name in session.execute(select(County.id, County.name))}
    stats: dict[str, Any] = {"upserted": 0, "deactivated": 0, "by_operator": {}, "failed": []}
    seen: dict[str, set[str]] = {}
    for operator, path in SOURCES:
        wait_for_slot(r, "rl:tdx", s.tdx_per_minute, 60_000)
        if not has_room(r, "tdx_points", s.quota_tdx_points_units, BASIC_CALL_UNITS):
            raise QuotaExhausted("TDX 本月點數用完，暫停車站更新（5.5）")
        try:
            items = tdx.get_basic(path)
        except TdxError as exc:
            # 某個系統抓不到時，其他照樣更新；這個系統的車站維持原狀
            log.warning("抓 %s 車站失敗：%s", operator, exc)
            stats["failed"].append(operator)
            continue
        add_usage(r, "tdx_points", BASIC_CALL_UNITS)
        rows = parse_stations(items, operator, counties)
        if rows:
            stmt = insert(Station).values(rows)
            session.execute(
                stmt.on_conflict_do_update(
                    index_elements=["station_uid"],
                    set_={
                        "operator": stmt.excluded.operator,
                        "name": stmt.excluded.name,
                        "county_id": stmt.excluded.county_id,
                        "geom": stmt.excluded.geom,
                        "is_active": True,
                        "updated_at": text("now()"),
                    },
                )
            )
        seen[operator] = {row["station_uid"] for row in rows}
        stats["upserted"] += len(rows)
        stats["by_operator"][operator] = len(rows)
        session.commit()
        keep_alive()

    for operator, uids in seen.items():
        result = session.execute(
            update(Station)
            .where(Station.operator == operator, Station.station_uid.not_in(uids or {""}))
            .where(Station.station_uid.not_like("demo-%"), Station.is_active)
            .values(is_active=False)
        )
        stats["deactivated"] += result.rowcount
    if stats["upserted"]:
        # 真的車站進來了，示意的出發站不再顯示
        result = session.execute(
            update(Station)
            .where(Station.station_uid.like("demo-%"), Station.is_active)
            .values(is_active=False)
        )
        stats["demo_deactivated"] = result.rowcount
    session.commit()
    return stats
