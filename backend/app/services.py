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
from starlette.concurrency import run_in_threadpool

from app import locations
from app.collectors.tdx_geocode import Geocoder
from app.config import Settings, get_settings
from app.jev.mock import MODEL as MOCK_JEV_MODEL
from app.labels import HALL_TYPE_LABELS
from app.planner import google_details_per_plan
from app.redis_client import sync_redis
from app.redis_utils.quota import aused
from app.redis_utils.ratelimit import hit
from app.schemas import PlanRequest
from app.tdx import TdxError, TdxQuotaExhausted, TdxTransit
from app.transit import haversine_m

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


# ── 地點搜尋（自選的出發位置） ─────────────────────────────────


class _TdxBusy(Exception):
    def __init__(self, retry_after_seconds: int):
        self.retry_after_seconds = retry_after_seconds


def _tdx_search(s: Settings, q: str) -> list[dict[str, Any]]:
    """在執行緒裡跑（TDX 用戶端是同步的）。"""
    r = sync_redis()

    def limiter() -> None:
        # 不等額度：規劃可能正在用，搶不到就請使用者稍後再試
        result = hit(r, "rl:tdx", s.tdx_per_minute, 60_000)
        if not result.allowed:
            raise _TdxBusy(result.retry_after_seconds)

    tdx = TdxTransit(
        s.tdx_client_id, s.tdx_client_secret, r, timeout=s.http_timeout_seconds,
        limiter=limiter, points_limit=s.quota_tdx_points_units,
    )  # fmt: skip
    geo = Geocoder(tdx, r, s)
    return [
        {"name": h.name, "address": h.address, "lat": h.lat, "lng": h.lng}
        for h in locations.search(geo.markname, geo.address, q)
    ]


async def _mock_search(db: AsyncSession, q: str) -> list[dict[str, Any]]:
    """TDX_MODE=mock：只從車站、商圈代表點、影城的名稱找（示意，不花點數）。"""
    rows = await db.execute(
        text(
            """
            SELECT name, NULL AS address, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lng
              FROM stations WHERE is_active AND name ILIKE :p
            UNION ALL
            SELECT name, NULL, ST_Y(geom::geometry), ST_X(geom::geometry)
              FROM area_hubs WHERE geom IS NOT NULL AND name ILIKE :p
            UNION ALL
            SELECT name, address, ST_Y(geom::geometry), ST_X(geom::geometry)
              FROM cinemas WHERE is_active AND geom IS NOT NULL AND name ILIKE :p
            LIMIT :n
            """
        ),
        {"p": f"%{q}%", "n": locations.MAX_RESULTS},
    )
    return [dict(x._mapping) for x in rows]


async def search_locations(
    db: AsyncSession, r: aioredis.Redis, s: Settings, q: str, area: str | None = None
) -> list[dict[str, Any]]:
    """輸入地址或地標名稱，回傳桃園市的候選位置（6.2）。結果快取 7 天。

    有給 `area` 時，只留離這個商圈代表點 30 公里內的（跟規劃的檢查一樣）。
    """
    q = locations.normalize(q)
    if not 2 <= len(q) <= 50:
        raise invalid("搜尋的文字要 2～50 個字")
    hubs = None
    if area:
        area_id = await _open_area_id(db, area)
        hubs = (
            await db.execute(
                text(
                    "SELECT ST_Y(geom::geometry) lat, ST_X(geom::geometry) lng FROM area_hubs "
                    "WHERE area_id = :a AND geom IS NOT NULL"
                ),
                {"a": area_id},
            )
        ).all()
    key = locations.cache_key(q) if s.tdx_mode == "real" else locations.cache_key(f"mock:{q}")
    cached = await r.get(key)
    if cached is not None:
        hits = json.loads(cached)
    elif s.tdx_mode != "real":
        hits = await _mock_search(db, q)
    else:
        try:
            hits = await run_in_threadpool(_tdx_search, s, q)
        except _TdxBusy as exc:
            raise ApiError(
                429, "RATE_LIMITED", "地點搜尋忙碌中，請稍後再試",
                headers={"Retry-After": str(exc.retry_after_seconds)},
            ) from None  # fmt: skip
        except TdxQuotaExhausted:
            raise ApiError(
                503, "SERVICE_UNAVAILABLE", "地點搜尋暫停（TDX 本月點數用完），請改選出發站"
            ) from None
        except TdxError:
            raise ApiError(
                503, "SERVICE_UNAVAILABLE", "地點搜尋暫時無法使用，請改選出發站"
            ) from None
        await r.set(key, json.dumps(hits, ensure_ascii=False), ex=locations.CACHE_TTL_SECONDS)
    if hubs is not None:
        limit_m = s.origin_max_distance_km * 1000
        hits = [
            h for h in hits
            if any(haversine_m(h["lat"], h["lng"], x.lat, x.lng) <= limit_m for x in hubs)
        ]  # fmt: skip
    return hits


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
    # 跟規劃同一個標準：額度不夠一次規劃查完就算 osm（app.planner.google_source）
    used = await aused(r, "google:details_enterprise")
    need = google_details_per_plan(s)
    return "google" if used + need <= s.quota_google_details_enterprise else "osm"


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
