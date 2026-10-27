"""MCP 伺服器（規格書 6.6）：官方 `mcp` 2.x 的 `MCPServer`，掛在 `/mcp`。

依 2026-07-28 版規範（無狀態）。

5 個工具直接呼叫 `services.py`，不經過 REST 端點；`plan_date` 跟 `POST /api/plans` 共用
`plan_stream`：同樣的限流和排隊上限（以 MCP 客戶端的 IP 計算），進度轉成 MCP 的進度通知。
LLM 備援不用 sampling（新版規範已棄用），跟網頁一樣由 worker 呼叫 Ollama。
"""

import uuid
from datetime import date
from typing import Any, Literal

from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import ValidationError

from app import services
from app.config import get_settings
from app.db import async_session
from app.plan_stream import plan_events, reserve_plan
from app.redis_client import async_redis
from app.schemas import PlanRequest
from app.services import ApiError

INSTRUCTIONS = (
    "ZeroGap 零空檔：規劃「電影＋餐廳＋交通」的行程。"
    "請依序呼叫：list_areas（商圈代碼）→ list_stations（出發站 id；"
    "或用 search_locations 以地址、地標找出發位置）"
    "→ list_categories（片型、料理代碼）"
    "→ data_coverage（有場次的日期、電影 id、影廳、語言）→ plan_date。"
    "一次規劃約 1～3 分鐘，期間會送出進度通知。資料是學術展示用。"
)

mcp = MCPServer("ZeroGap", instructions=INSTRUCTIONS)

# 步行上限的選項跟著設定（WALK_LIMIT_OPTIONS），工具的 schema 才列得出可以填的值（bug 清單 L3）
WalkMinutes = Literal[tuple(get_settings().walk_limit_options)]  # type: ignore[valid-type]

STAGE_TEXT = {
    "loading_data": "讀取場次和餐廳",
    "checking_feasibility": "查交通的可行時間",
    "filtering": "篩出接得上的組合",
    "choosing": "請 Jev 選片和餐廳",
    "llm_fallback": "Jev 沒把握，交給 LLM 代選",
    "verifying_hours": "確認營業時間",
    "routing": "查精確路線",
    "waiting_quota": "等待交通查詢額度",
    "building_result": "整理結果",
}


def _tool_error(exc: ApiError) -> ToolError:
    return ToolError(f"{exc.code}：{exc.message}")


@mcp.tool()
async def list_areas(county: str | None = None) -> dict[str, Any]:
    """縣市清單，以及商圈（is_open 為 true 的才能規劃）。county 用縣市代碼，例如 Taoyuan。"""
    async with async_session()() as db:
        try:
            return {
                "counties": await services.list_counties(db),
                "areas": await services.list_areas(db, county),
            }
        except ApiError as exc:
            raise _tool_error(exc) from None


@mcp.tool()
async def search_locations(q: str, area: str | None = None) -> list[dict[str, Any]]:
    """用地址或地標名稱找出發位置（桃園市內），回傳名稱、地址、座標。
    plan_date 用 origin_lat、origin_lng、origin_name 帶入；有給 area 只留離商圈 30 公里內的。"""
    async with async_session()() as db:
        try:
            return await services.search_locations(db, async_redis(), get_settings(), q, area)
        except ApiError as exc:
            raise _tool_error(exc) from None


@mcp.tool()
async def list_stations(county: str) -> list[dict[str, Any]]:
    """某縣市的出發站（id、站名、業者）。plan_date 的 origin_station_id 用這裡的 id。"""
    async with async_session()() as db:
        try:
            return await services.list_stations(db, county)
        except ApiError as exc:
            raise _tool_error(exc) from None


@mcp.tool()
async def list_categories(kind: Literal["movie_genre", "cuisine"]) -> list[dict[str, Any]]:
    """片型（movie_genre）或料理類別（cuisine）的代碼和名稱。"""
    async with async_session()() as db:
        try:
            return await services.list_categories(db, kind)
        except ApiError as exc:
            raise _tool_error(exc) from None


@mcp.tool()
async def data_coverage(area: str, date: date | None = None) -> dict[str, Any]:
    """商圈有場次的日期（available_dates）；指定日期時另外列出可看的電影、片型、影廳、語言。"""
    async with async_session()() as db:
        try:
            out = await services.get_coverage(db, async_redis(), get_settings(), area, date)
        except ApiError as exc:
            raise _tool_error(exc) from None
    return _jsonable(out)


@mcp.tool()
async def plan_date(
    ctx: Context,
    area: str,
    date: str,
    earliest_departure: str,
    latest_home: str,
    order: Literal["movie_first", "meal_first"],
    budget_per_person: int,
    max_walk_minutes: WalkMinutes,
    movie_id: int | None = None,
    movie_genre: str | None = None,
    hall_type: str | None = None,
    language: str | None = None,
    cuisine: str | None = None,
    origin_station_id: int | None = None,
    origin_lat: float | None = None,
    origin_lng: float | None = None,
    origin_name: str | None = None,
) -> dict[str, Any]:
    """規劃行程，回傳前三名方案（格式同 REST 的 POST /api/plans 的 result）。

    出發點二擇一：origin_station_id（list_stations 的 id），
    或使用者目前位置／search_locations 找到的 origin_lat、origin_lng（origin_name 是顯示的名稱）；
    回到出發點就算到家。

    date 是 YYYY-MM-DD（要是 data_coverage 的 available_dates 之一）；時間是 HH:MM，
    latest_home 早於 06:00 算隔天（最晚 02:00）；budget_per_person 是每人新台幣（含來回車資）。
    「不限」「交給 Jev 決定」都傳 null。
    """
    try:
        req = PlanRequest.model_validate(
            {
                "area": area, "origin_station_id": origin_station_id, "origin_lat": origin_lat,
                "origin_lng": origin_lng, "origin_name": origin_name, "date": date,
                "earliest_departure": earliest_departure, "latest_home": latest_home,
                "order": order, "movie_id": movie_id, "movie_genre": movie_genre,
                "hall_type": hall_type, "language": language, "cuisine": cuisine,
                "budget_per_person": budget_per_person, "max_walk_minutes": max_walk_minutes,
            }
        )  # fmt: skip
    except ValidationError as exc:
        first = exc.errors()[0]
        raise ToolError(f"VALIDATION_ERROR：{first.get('msg', '輸入不合法')}") from None

    s, r = get_settings(), async_redis()
    request = ctx.request_context.request
    ip = request.client.host if getattr(request, "client", None) else "mcp"
    job_id = uuid.uuid4().hex
    try:
        async with async_session()() as db:
            await services.validate_plan(db, req)
        await reserve_plan(r, s, ip, job_id)
    except ApiError as exc:
        raise _tool_error(exc) from None

    step = 0
    async for name, data in plan_events(r, s, job_id, req.model_dump(mode="json"), ip):
        if name == "result":
            return data
        if name == "error":
            raise ToolError(f"{data['code']}：{data['message']}")
        if name == "queued":
            message = f"排隊中，前面還有 {data['position'] - 1} 個"
        elif name == "progress":
            message = STAGE_TEXT.get(data.get("stage"), data.get("stage", ""))
            if data.get("stage") == "filtering":
                message += f"：{data['combinations']:,} 種組合 → {data['feasible']} 種接得上"
        else:
            continue  # ping
        step += 1
        await ctx.report_progress(step, message=message)
    raise ToolError("INTERNAL_ERROR：規劃中斷，請再試一次")


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value
