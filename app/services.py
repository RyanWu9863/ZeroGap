"""API 和（之後的）MCP 共用的服務函式（規格書 6.2、6.6）。

這裡只處理資料，不碰 HTTP；錯誤一律丟 `ApiError`，由 API 轉成 6.1 的錯誤格式。
"""

import json
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import redis.asyncio as aioredis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.jev.mock import MODEL as MOCK_JEV_MODEL
from app.labels import HALL_TYPE_LABELS
from app.redis_utils.quota import aused
from app.schemas import PlanRequest

TZ = ZoneInfo("Asia/Taipei")
CATEGORY_KINDS = ("movie_genre", "cuisine")
DATA_JOBS = ("atmovies", "osm", "google_places", "tdx_stations")


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
        reasons: dict[str, int] | None = None,
    ):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message
        self.headers = headers or {}
        self.reasons = reasons


def not_found(message: str) -> ApiError:
    return ApiError(404, "NOT_FOUND", message)


def invalid(message: str) -> ApiError:
    return ApiError(400, "VALIDATION_ERROR", message)


def _now() -> datetime:
    return datetime.now(TZ)


# ── 下拉選單 ─────────────────────────────────────────────────


async def list_counties(db: AsyncSession) -> list[dict[str, Any]]:
    rows = await db.execute(
        text(
            """
            SELECT c.code, c.name,
                   EXISTS (SELECT 1 FROM areas a WHERE a.county_id = c.id AND a.is_open)
                     AS has_open_areas
            FROM counties c ORDER BY c.sort_order, c.id
            """
        )
    )
    return [dict(r._mapping) for r in rows]


async def _county_id(db: AsyncSession, code: str) -> int:
    county_id = await db.scalar(text("SELECT id FROM counties WHERE code = :c"), {"c": code})
    if county_id is None:
        raise not_found(f"縣市 {code} 不存在")
    return county_id


async def list_areas(db: AsyncSession, county: str | None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {}
    where = ""
    if county is not None:
        params["county"] = await _county_id(db, county)
        where = "WHERE county_id = :county"
    rows = await db.execute(
        text(f"SELECT code, name, is_open FROM areas {where} ORDER BY sort_order, id"), params
    )
    return [dict(r._mapping) for r in rows]


async def list_stations(db: AsyncSession, county: str) -> list[dict[str, Any]]:
    county_id = await _county_id(db, county)
    rows = await db.execute(
        text(
            "SELECT id, name, operator FROM stations "
            "WHERE county_id = :c AND is_active ORDER BY operator, name, id"
        ),
        {"c": county_id},
    )
    return [dict(r._mapping) for r in rows]


async def list_categories(db: AsyncSession, kind: str) -> list[dict[str, Any]]:
    if kind not in CATEGORY_KINDS:
        raise invalid(f"kind 只能是 {' 或 '.join(CATEGORY_KINDS)}")
    rows = await db.execute(
        text("SELECT code, label FROM categories WHERE kind = :k ORDER BY sort_order, id"),
        {"k": kind},
    )
    return [dict(r._mapping) for r in rows]


# ── coverage、狀態列 ──────────────────────────────────────────


async def _open_area_id(db: AsyncSession, area: str) -> int:
    area_id = await db.scalar(text("SELECT id FROM areas WHERE code = :c AND is_open"), {"c": area})
    if area_id is None:
        raise not_found(f"商圈 {area} 不存在或沒有開放")
    return area_id


async def available_dates(db: AsyncSession, area_id: int) -> list[date]:
    """這個商圈還有場次可看的日期；已經開演完的不算（6.3）。"""
    rows = await db.execute(
        text(
            """
            SELECT DISTINCT (s.starts_at AT TIME ZONE 'Asia/Taipei')::date AS d
            FROM showtimes s JOIN cinemas c ON c.id = s.cinema_id
            WHERE c.area_id = :a AND c.is_active AND s.starts_at > :now
            ORDER BY d
            """
        ),
        {"a": area_id, "now": _now()},
    )
    return [r.d for r in rows]


async def restaurant_source(r: aioredis.Redis, s: Settings) -> str:
    used = await aused(r, "google:details_enterprise")
    return "google" if used < s.quota_google_details_enterprise else "osm"


async def get_coverage(
    db: AsyncSession, r: aioredis.Redis, s: Settings, area: str, day: date | None
) -> dict[str, Any]:
    area_id = await _open_area_id(db, area)
    dates = await available_dates(db, area_id)
    out: dict[str, Any] = {
        "area": area,
        "showtime_from": dates[0] if dates else None,
        "showtime_to": dates[-1] if dates else None,
        "available_dates": dates,
        "movies": [],
        "genres": [],
        "hall_types": [],
        "languages": [],
        "restaurant_source": await restaurant_source(r, s),
    }
    if day is None:
        return out
    start = datetime.combine(day, datetime.min.time(), TZ)
    params = {"a": area_id, "start": max(start, _now()), "end": start + timedelta(days=1)}
    base = """
        FROM showtimes s JOIN cinemas c ON c.id = s.cinema_id JOIN movies m ON m.id = s.movie_id
        WHERE c.area_id = :a AND c.is_active AND s.starts_at >= :start AND s.starts_at < :end
    """
    movies = await db.execute(
        text(
            f"SELECT DISTINCT m.id, m.title, m.genre_code AS genre, m.runtime_min {base} "
            "ORDER BY m.title, m.id"
        ),
        params,
    )
    out["movies"] = [dict(row._mapping) for row in movies]
    genres = await db.execute(
        text(
            f"""
            SELECT g.code, g.label FROM categories g
            WHERE g.kind = 'movie_genre'
              AND g.code IN (SELECT m.genre_code {base})
            ORDER BY g.sort_order
            """
        ),
        params,
    )
    out["genres"] = [dict(row._mapping) for row in genres]
    halls = await db.scalars(text(f"SELECT DISTINCT s.hall_type {base}"), params)
    order = list(HALL_TYPE_LABELS)
    out["hall_types"] = [
        {"code": h, "label": HALL_TYPE_LABELS.get(h, h)}
        for h in sorted(halls, key=lambda h: order.index(h) if h in order else len(order))
    ]
    languages = await db.scalars(
        text(f"SELECT DISTINCT s.language {base} AND s.language IS NOT NULL ORDER BY 1"), params
    )
    out["languages"] = list(languages)
    return out


async def llm_connected(r: aioredis.Redis, s: Settings) -> bool:
    """對 Ollama 做一次快速檢查，結果快取 30 秒（5.2、6.3）。"""
    if s.llm_mode == "mock":
        return False
    cached = await r.get("status:llm")
    if cached is not None:
        return cached == "1"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            ok = (await client.get(f"{s.ollama_base_url.rstrip('/')}/api/tags")).status_code == 200
    except httpx.HTTPError:
        ok = False
    await r.set("status:llm", "1" if ok else "0", ex=s.llm_status_ttl_seconds)
    return ok


async def get_status(db: AsyncSession, r: aioredis.Redis, s: Settings) -> dict[str, Any]:
    rows = await db.execute(
        text(
            """
            SELECT job, max(finished_at) AS finished_at FROM crawl_runs
            WHERE status = 'success' GROUP BY job
            """
        )
    )
    updated = {row.job: row.finished_at for row in rows}
    return {
        "jev": {
            "mode": s.jev_mode,
            "model": MOCK_JEV_MODEL if s.jev_mode == "mock" else s.jev_model,
        },
        "llm": {
            "connected": await llm_connected(r, s),
            "model": s.ollama_model if s.llm_mode != "mock" else None,
        },
        "data_updated_at": {
            job: (updated[job].astimezone(TZ) if updated.get(job) else None) for job in DATA_JOBS
        },
        "restaurant_source": await restaurant_source(r, s),
    }


# ── 規劃請求的檢查 ─────────────────────────────────────────────


async def validate_plan(db: AsyncSession, req: PlanRequest) -> None:
    """格式以外的檢查：商圈、車站、日期、電影、類別都要存在（6.4）。"""
    area_id = await _open_area_id(db, req.area)
    if req.origin_station_id is not None:
        station = await db.scalar(
            text("SELECT id FROM stations WHERE id = :i AND is_active"),
            {"i": req.origin_station_id},
        )
        if station is None:
            raise not_found(f"出發站 {req.origin_station_id} 不存在")
    else:
        # 目前位置離商圈太遠就不排（2026-10-21 使用者決定）
        meters = await db.scalar(
            text(
                "SELECT min(ST_Distance(geom, ST_GeogFromText(:p))) FROM area_hubs "
                "WHERE area_id = :a AND geom IS NOT NULL"
            ),
            {"p": f"SRID=4326;POINT({req.origin_lng} {req.origin_lat})", "a": area_id},
        )
        limit_km = get_settings().origin_max_distance_km
        if meters is None or meters > limit_km * 1000:
            raise invalid(f"目前位置離這個商圈超過 {limit_km:g} 公里，請改選出發站")
    if req.date not in await available_dates(db, area_id):
        raise invalid("這一天沒有場次資料，請從 /api/coverage 的 available_dates 選日期")
    earliest, _ = req.resolved_times()
    if earliest <= _now():
        raise invalid("最早出門要晚於現在")
    if req.movie_id is not None:
        movie = await db.scalar(text("SELECT id FROM movies WHERE id = :i"), {"i": req.movie_id})
        if movie is None:
            raise not_found(f"電影 {req.movie_id} 不存在")
    for kind, code in (("movie_genre", req.movie_genre), ("cuisine", req.cuisine)):
        if code is not None:
            found = await db.scalar(
                text("SELECT 1 FROM categories WHERE kind = :k AND code = :c"),
                {"k": kind, "c": code},
            )
            if found is None:
                raise invalid(f"{kind} 沒有 {code} 這個代碼")
    if req.hall_type is not None and req.hall_type not in HALL_TYPE_LABELS:
        raise invalid(f"hall_type 沒有 {req.hall_type} 這個代碼")


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"
