"""REST 端點（規格書 6.2）。實際的事交給 `services.py` 和 `plan_stream.py`。"""

import uuid
from collections.abc import AsyncIterator
from datetime import date
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import services
from app.config import Settings, get_settings
from app.db import async_session
from app.plan_stream import plan_events, rate_limited, reserve_plan, sse_stream
from app.redis_client import async_redis
from app.redis_utils.ratelimit import ahit
from app.schemas import (
    AreaOut,
    CategoryOut,
    CountyOut,
    CoverageOut,
    LocationOut,
    PlanRequest,
    StationOut,
    StatusOut,
)

router = APIRouter(prefix="/api")


async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session()() as session:
        yield session


def get_redis() -> aioredis.Redis:
    return async_redis()


def client_ip(request: Request) -> str:
    # uvicorn 開了 --proxy-headers，這裡已經是 X-Forwarded-For 裡使用者的 IP
    return request.client.host if request.client else "unknown"


async def read_limit(
    request: Request,
    r: Annotated[aioredis.Redis, Depends(get_redis)],
    s: Annotated[Settings, Depends(get_settings)],
) -> None:
    """其他查詢：每個 IP 每分鐘 60 次（5.5）。"""
    result = await ahit(r, f"rl:api:read:{client_ip(request)}", s.api_read_per_minute, 60_000)
    if not result.allowed:
        raise rate_limited(result.retry_after_seconds)


Db = Annotated[AsyncSession, Depends(get_db)]
Redis = Annotated[aioredis.Redis, Depends(get_redis)]
Conf = Annotated[Settings, Depends(get_settings)]
read = [Depends(read_limit)]


@router.get("/counties", response_model=list[CountyOut], dependencies=read)
async def counties(db: Db):
    return await services.list_counties(db)


@router.get("/areas", response_model=list[AreaOut], dependencies=read)
async def areas(db: Db, county: str | None = None):
    return await services.list_areas(db, county)


@router.get("/stations", response_model=list[StationOut], dependencies=read)
async def stations(db: Db, county: Annotated[str, Query(min_length=1)]):
    return await services.list_stations(db, county)


@router.get("/categories", response_model=list[CategoryOut], dependencies=read)
async def categories(db: Db, kind: Annotated[str, Query(min_length=1)]):
    return await services.list_categories(db, kind)


@router.get("/coverage", response_model=CoverageOut, dependencies=read)
async def coverage(
    db: Db, r: Redis, s: Conf, area: Annotated[str, Query(min_length=1)], date: date | None = None
):
    return await services.get_coverage(db, r, s, area, date)


@router.get("/locations", response_model=list[LocationOut], dependencies=read)
async def locations(
    request: Request,
    db: Db,
    r: Redis,
    s: Conf,
    q: Annotated[str, Query(min_length=1)],
    area: str | None = None,
):
    """自選的出發位置：輸入地址或地標名稱（6.2）。每個 IP 每小時最多 20 次（會查 TDX）。"""
    result = await ahit(
        r, f"rl:api:loc:{client_ip(request)}", s.api_location_search_per_hour, 3_600_000
    )
    if not result.allowed:
        raise rate_limited(result.retry_after_seconds)
    return await services.search_locations(db, r, s, q, area)


@router.get("/status", response_model=StatusOut, dependencies=read)
async def status(db: Db, r: Redis, s: Conf):
    return await services.get_status(db, r, s)


@router.get("/health")
async def health(db: Db, r: Redis):
    await db.execute(text("SELECT 1"))
    await r.ping()
    return {"status": "ok"}


@router.post("/plans")
async def create_plan(request: Request, req: PlanRequest, db: Db, r: Redis, s: Conf):
    """送出規劃，直接回傳 SSE 串流（6.4）。被擋下時回一般的 JSON 錯誤，不開始串流。"""
    await services.validate_plan(db, req)
    ip = client_ip(request)
    job_id = uuid.uuid4().hex
    await reserve_plan(r, s, ip, job_id)
    events = plan_events(r, s, job_id, req.model_dump(mode="json"), ip, request.is_disconnected)
    return StreamingResponse(
        sse_stream(events),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
