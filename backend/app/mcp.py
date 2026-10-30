"""MCP 伺服器（規格書 6.6）：官方 `mcp` 2.x 的 `MCPServer`，掛在 `/mcp`。

依 2026-07-28 版規範（無狀態）。

6 個工具直接呼叫 `services.py`，不經過 REST 端點；`plan_date` 跟 `POST /api/plans` 共用
`plan_stream`：同樣的限流和排隊上限（以 MCP 客戶端的 IP 計算），進度轉成 MCP 的進度通知。
LLM 備援不用 sampling（新版規範已棄用），跟網頁一樣由 worker 呼叫 Ollama。
"""

import datetime as dt
import uuid
from contextlib import aclosing
from datetime import date, datetime
from typing import Annotated, Any, Literal

from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field, ValidationError

from app import services
from app.config import get_settings
from app.db import async_session
from app.plan_stream import plan_events, reserve_plan
from app.redis_client import async_redis
from app.relative_dates import DateNotUnderstood, resolve_date
from app.schemas import PlanRequest
from app.services import ApiError

# 工具說明是寫給 AI 看的：評測（mcp-eval v1）發現小模型會猜參數、沒資訊也硬排，所以寫明規則
INSTRUCTIONS = (
    "ZeroGap 零空檔：規劃「看電影＋吃飯＋交通接駁」的行程，保證每一段的時間都接得上。\n"
    "服務範圍：目前只有桃園市的商圈（list_areas 裡 is_open 為 true 的才能規劃）。"
    "其他縣市、其他功能（訂票、只找餐廳不看電影等）都做不到，請直接告訴使用者。\n"
    "規則：\n"
    "1. 一次只呼叫一個工具，拿到結果再決定下一步；參數一定要用前面查到的值，不要猜。\n"
    "2. 順序：list_areas（商圈 code）→ data_coverage（帶 date，查那天的電影、片型、影廳、語言，"
    "以及排得到的料理）"
    "→ plan_date。出發點是車站就直接填 origin_station_name（例如「中壢站」）；"
    "是地標或地址才用 search_locations。片型、料理代碼可以用 list_categories 查。\n"
    # v2a 寫「沒講就先問」，結果小模型條件都給了還在反問（mcp-eval v2a：正常題只送出 21/45）
    "3. 只有使用者「完全沒提到」出發點、日期、出門或回家時間、每人預算時才問；"
    "已經講了的（例如「中壢站出發」「每人 800」「十點前回家」）就直接用，不要再跟使用者確認。"
    "走路上限、片型、料理沒講都不用問。\n"
    "4. 商圈沒開放、日期不在 available_dates、想看的片型或影廳那天沒有、想吃的料理不在 cuisines："
    "告訴使用者並建議替代方案，不要呼叫 plan_date。\n"
    "5. 日期直接照使用者的說法填（例如「週六」「明天」），伺服器會換算，不用自己算。\n"
    "一次規劃約 1～3 分鐘，期間會送出進度通知。資料是學術展示用。"
)

mcp = MCPServer("ZeroGap", instructions=INSTRUCTIONS)

# 步行上限的選項跟著設定（WALK_LIMIT_OPTIONS），工具的 schema 才列得出可以填的值（bug 清單 L3）
WalkMinutes = Literal[tuple(get_settings().walk_limit_options)]  # type: ignore[valid-type]
# 使用者沒講時的預設值；設定裡沒有 12 就取中間那個選項
_WALK_OPTIONS = get_settings().walk_limit_options
WALK_DEFAULT = 12 if 12 in _WALK_OPTIONS else _WALK_OPTIONS[len(_WALK_OPTIONS) // 2]

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

# NO_FEASIBLE 的 reasons（規格書 6.4）
REASON_TEXT = {
    "showtime": "趕不上開演",
    "walk": "影城到餐廳走太遠",
    "opening_hours": "不在營業時間",
    "last_order": "過了最後點餐",
    "last_train": "趕不上回程",
    "budget": "超過預算",
    "transit_window": "出發點的交通接不上",
}


def _tool_error(exc: ApiError) -> ToolError:
    return ToolError(f"{exc.code}：{exc.message}")


def _plan_error_text(data: dict[str, Any]) -> str:
    """附上 reasons：AI 只看到「可以放寬」就只會叫使用者加預算，要知道卡在哪才建議得對
    （2026-10-30 mcp-eval 端到端 N01）。網頁的 SSE 本來就有 reasons。"""
    out = f"{data['code']}：{data['message']}"
    reasons = data.get("reasons") or {}
    if reasons:
        parts = "、".join(f"{REASON_TEXT.get(k, k)} {n:,}" for k, n in reasons.items())
        out += f"（被排除的組合：{parts}）"
    return out


def validation_error_text(exc: ValidationError) -> str:
    """錯誤訊息也是寫給 AI 看的：要說是哪個欄位，AI 才知道要補什麼
    （mcp-eval v1：只回「Field required」時，AI 重送 19 次全部失敗）。"""
    first = exc.errors()[0]
    field = ".".join(str(part) for part in first.get("loc", ()))
    if first.get("type") == "missing":
        return f"VALIDATION_ERROR：{field} 是必填，請補上；不知道就先問使用者"
    message = first.get("msg", "輸入不合法")
    return f"VALIDATION_ERROR：{field}：{message}" if field else f"VALIDATION_ERROR：{message}"


def _date_param(text: str | None, today: date) -> str | None:
    """MCP 的 date 參數可以直接照抄使用者的說法（「明天」「週六」），在這裡換成 YYYY-MM-DD。
    小模型很難算星期（mcp-eval v3：通過驗證的 9 次全都差在日期）。"""
    if text is None:
        return None
    try:
        return resolve_date(text, today).isoformat()
    except DateNotUnderstood as exc:
        raise ToolError(f"VALIDATION_ERROR：date：{exc}") from None


def _today() -> date:
    return datetime.now(services.TZ).date()


@mcp.tool()
async def list_areas(
    county: Annotated[
        str | None, Field(description="縣市代碼（英文，例如 Taoyuan），不是中文；不填就列出全部")
    ] = None,
) -> dict[str, Any]:
    """縣市清單，以及商圈。plan_date 的 area 要用這裡商圈的 code（小寫英文，例如 zhongli），
    is_open 為 true 才能規劃；目前只有桃園市有開放的商圈。"""
    async with async_session()() as db:
        try:
            return {
                "counties": await services.list_counties(db),
                "areas": await services.list_areas(db, county),
            }
        except ApiError as exc:
            raise _tool_error(exc) from None


@mcp.tool()
async def search_locations(
    q: Annotated[str, Field(description="地址或地標名稱，例如「中原大學」「桃園市政府」")],
    area: Annotated[
        str | None, Field(description="商圈 code（例如 zhongli）；有給只留離商圈 30 公里內的")
    ] = None,
) -> list[dict[str, Any]]:
    """用地址或地標名稱找出發位置（只支援桃園市內），回傳名稱、地址、座標。
    plan_date 用第一筆的 lat、lng、name 帶入 origin_lat、origin_lng、origin_name。
    使用者說的是火車站、捷運站時，改用 list_stations。"""
    async with async_session()() as db:
        try:
            return await services.search_locations(db, async_redis(), get_settings(), q, area)
        except ApiError as exc:
            raise _tool_error(exc) from None


@mcp.tool()
async def list_stations(
    county: Annotated[str, Field(description="縣市代碼（英文，例如 Taoyuan）")],
) -> list[dict[str, Any]]:
    """某縣市的出發站（id、站名、業者：TRA 台鐵、THSR 高鐵、TYMC 桃園捷運）。
    plan_date 的 origin_station_id 用這裡的 id，不要自己編數字。"""
    async with async_session()() as db:
        try:
            return await services.list_stations(db, county)
        except ApiError as exc:
            raise _tool_error(exc) from None


@mcp.tool()
async def list_categories(
    kind: Annotated[
        Literal["movie_genre", "cuisine"],
        Field(description="movie_genre＝電影片型；cuisine＝料理類別"),
    ],
) -> list[dict[str, Any]]:
    """片型（movie_genre）或料理類別（cuisine）的代碼和名稱。
    plan_date 的 movie_genre、cuisine 要用這裡的 code（例如 action、japanese）。"""
    async with async_session()() as db:
        try:
            return await services.list_categories(db, kind)
        except ApiError as exc:
            raise _tool_error(exc) from None


@mcp.tool()
async def data_coverage(
    area: Annotated[str, Field(description="商圈 code（list_areas 的 code，例如 zhongli）")],
    date: Annotated[
        str | None,
        Field(
            description=(
                "可以直接照使用者的說法填，例如「明天」「週六」「下週日」「12/25」，"
                "也可以填 YYYY-MM-DD；要知道那天有哪些電影、片型、影廳、語言時一定要帶"
            )
        ),
    ] = None,
) -> dict[str, Any]:
    """商圈有場次的日期（available_dates），和排得到的餐廳有哪些料理（cuisines，跟日期無關）；
    指定日期時另外列出可看的電影（含 id）、片型、影廳、語言。
    available_dates 是空的，代表這個商圈目前沒有資料，不能規劃。"""
    day = _date_param(date, _today())
    async with async_session()() as db:
        try:
            out = await services.get_coverage(
                db,
                async_redis(),
                get_settings(),
                area,
                None if day is None else dt.date.fromisoformat(day),
            )
        except ApiError as exc:
            raise _tool_error(exc) from None
    return _jsonable(out)


@mcp.tool()
async def plan_date(
    ctx: Context,
    area: Annotated[
        str,
        Field(
            description=(
                "商圈 code：list_areas 回傳的 code（小寫英文，例如 zhongli、taoyuan、bade），"
                "不是中文名稱，也不是縣市代碼"
            )
        ),
    ],
    date: Annotated[
        str,
        Field(
            description=(
                "可以直接照使用者的說法填，例如「明天」「週六」「下週日」「12/25」，伺服器會換算；"
                "也可以填 YYYY-MM-DD。必須是 data_coverage 的 available_dates 之一"
            )
        ),
    ],
    earliest_departure: Annotated[
        str,
        Field(
            description=("最早出門時間，24 小時制 HH:MM，例如下午兩點是 14:00、晚上七點是 19:00")
        ),
    ],
    latest_home: Annotated[
        str,
        Field(
            description=(
                "最晚到家時間，24 小時制 HH:MM。早於 06:00 算隔天凌晨（最晚 02:00），"
                "例如「晚上 12 點前」填 00:00、「凌晨一點半」填 01:30"
            )
        ),
    ],
    order: Annotated[
        Literal["movie_first", "meal_first"],
        Field(description=("movie_first＝先看電影再吃飯；meal_first＝先吃飯再看電影")),
    ],
    budget_per_person: Annotated[
        int,
        Field(
            description=(
                "每人預算（新台幣，含來回車資）。使用者給總預算要除以人數；沒講就先問使用者"
            )
        ),
    ],
    # 使用者幾乎不會主動講走路上限：給預設值，不讓它卡住整次規劃（mcp-eval v1：漏填 38/62 次）
    # 只有 MCP 有預設，REST 仍然必填（2026-10-29 使用者決定）
    max_walk_minutes: Annotated[
        WalkMinutes,
        Field(
            description=(
                "影城和餐廳之間最多走幾分鐘（只限制這一段），"
                f"只能是 {'、'.join(map(str, _WALK_OPTIONS))}。"
                "使用者說「不超過 10 分鐘」就選不超過的最大選項；"
                f"使用者沒講就不用填（預設 {WALK_DEFAULT}）"
            )
        ),
    ] = WALK_DEFAULT,
    movie_id: Annotated[
        int | None,
        Field(description=("指定某部電影：data_coverage（有帶 date）回傳的電影 id；不指定填 null")),
    ] = None,
    movie_genre: Annotated[
        str | None,
        Field(
            description=(
                "片型 code（list_categories 的 movie_genre，例如 action、horror）；不限填 null"
            )
        ),
    ] = None,
    hall_type: Annotated[
        str | None,
        Field(
            description=("影廳 code（data_coverage 的 hall_types，例如 imax、mx4d）；不限填 null")
        ),
    ] = None,
    language: Annotated[
        str | None,
        Field(
            description=("語言，照 data_coverage 的 languages 原字填，例如「日語」；不限填 null")
        ),
    ] = None,
    cuisine: Annotated[
        str | None,
        Field(
            description=(
                "料理 code（data_coverage 的 cuisines，例如 japanese、korean）；"
                "不限或使用者說「隨便」填 null"
            )
        ),
    ] = None,
    # 小模型常把站名對錯 id、甚至自己編數字（mcp-eval v2b：18/21 卡在出發點）→ 讓伺服器查
    origin_station_name: Annotated[
        str | None,
        Field(
            description=(
                "出發的車站名稱，例如「中壢站」「桃園火車站」「高鐵桃園站」。"
                "使用者講的是車站時直接填這個，伺服器會自己換成 id"
            )
        ),
    ] = None,
    origin_station_id: Annotated[
        int | None,
        Field(
            description=(
                "出發站 id（list_stations 回傳的 id）；通常不用填，"
                "改填 origin_station_name 比較簡單。車站、座標都不知道就先問使用者"
            )
        ),
    ] = None,
    origin_lat: Annotated[
        float | None,
        Field(description=("出發位置緯度（search_locations 的 lat），和 origin_station_id 二擇一")),
    ] = None,
    origin_lng: Annotated[
        float | None, Field(description=("出發位置經度（search_locations 的 lng）"))
    ] = None,
    origin_name: Annotated[
        str | None, Field(description=("出發位置的名稱（search_locations 的 name，最多 30 字）"))
    ] = None,
) -> dict[str, Any]:
    """規劃行程，回傳前三名方案（格式同 REST 的 POST /api/plans 的 result）。

    呼叫前要先用 data_coverage 確認那天有場次；每個參數都要用前面工具查到的值。
    回到出發點就算到家。「不限」「交給 Jev 決定」都傳 null。
    """
    req = await prepare_plan(
        {
            "area": area, "origin_station_name": origin_station_name,
            "origin_station_id": origin_station_id, "origin_lat": origin_lat,
            "origin_lng": origin_lng, "origin_name": origin_name, "date": date,
            "earliest_departure": earliest_departure, "latest_home": latest_home,
            "order": order, "movie_id": movie_id, "movie_genre": movie_genre,
            "hall_type": hall_type, "language": language, "cuisine": cuisine,
            "budget_per_person": budget_per_person, "max_walk_minutes": max_walk_minutes,
        }
    )  # fmt: skip

    s, r = get_settings(), async_redis()
    request = ctx.request_context.request
    ip = request.client.host if getattr(request, "client", None) else "mcp"
    job_id = uuid.uuid4().hex
    try:
        await reserve_plan(r, s, ip, job_id)
    except ApiError as exc:
        raise _tool_error(exc) from None

    step = 0
    # 在迴圈中途 return、raise 時，generator 會停在 yield，不會自己跑 finally（釋放這個 IP 的
    # 「規劃中」鎖），要等被回收才收尾 → 同一個 IP 下一次會一直收到 PLAN_IN_PROGRESS。
    # aclosing 保證離開時馬上收尾（2026-10-29 mcp-eval 端到端測試發現）
    events = plan_events(r, s, job_id, req.model_dump(mode="json"), ip)
    async with aclosing(events):
        async for name, data in events:
            if name == "result":
                return data
            if name == "error":
                raise ToolError(_plan_error_text(data))
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


async def prepare_plan(params: dict[str, Any]) -> PlanRequest:
    """plan_date 排程前的所有檢查：站名換成 id → PlanRequest 驗格式 → 查資料庫。
    評測（mcp-eval）也直接呼叫這裡，確保評測和正式流程走的是同一段程式。"""
    params = dict(params)
    params["date"] = _date_param(params.get("date"), _today())
    name = params.pop("origin_station_name", None)
    async with async_session()() as db:
        try:
            if params.get("origin_station_id") is None and name:
                area = params.get("area") or ""
                params["origin_station_id"] = await services.station_id_by_name(db, area, name)
            try:
                req = PlanRequest.model_validate(params)
            except ValidationError as exc:
                raise ToolError(validation_error_text(exc)) from None
            await services.validate_plan(db, req)
        except ApiError as exc:
            raise _tool_error(exc) from None
    return req


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value
