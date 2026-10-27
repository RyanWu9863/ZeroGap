"""真的 TDX 旅運規劃用戶端（規格書 3.2、5.3）。`TDX_MODE=real` 時使用。

回應格式是 2026-10-20 用金鑰實測的（官方文件沒寫 `sections`），範例在 tests/fixtures/tdx：
- `data.routes[]`：`start_time`、`end_time`（台北時間、沒有時區）、`transfers`、
  `total_price`（只有公車時才有）
- `sections[]`：`type` 是 `pedestrian`、`waiting`、`transit`……；`transit` 段的 `transport` 有
  `mode`（Bus、TRA……）、`name`（公車路線號碼，台鐵是起訖站）、`headsign`（往哪裡）
- 回傳的時間比要求的寬鬆（要 17:00 出發會給 16:48 出門的），所以多要幾條再篩

注意：TDX 公告旅運規劃 2026/12/31 下架（討論紀錄「第二階段開始前的查證」）。
"""

import logging
import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import redis

from app.planning.rules import walk_minutes
from app.planning.types import Route
from app.redis_utils.lock import acquire, release
from app.redis_utils.quota import add_usage, has_room
from app.transit import Endpoint, TimeMode, haversine_m, valid_routes

log = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Taipei")
TOKEN_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"
ROUTING_URL = "https://tdx.transportdata.tw/api/maas/routing"
BASIC_URL = "https://tdx.transportdata.tw/api/basic"
ADVANCED_URL = "https://tdx.transportdata.tw/api/advanced"
TOKEN_KEY = "tdx:access_token"
TOKEN_LOCK = "tdx:token"
# 固定參數（3.2）：高鐵、台鐵、公車、捷運、輕軌；偏好最快；頭尾一定要明確設成走路，
# 不帶的話 TDX 會自己安排騎車和叫計程車（實測）
FIXED_PARAMS = {
    "transit": "3,4,5,6,7",
    "gc": "1.0",
    "first_mile_mode": "0",
    "last_mile_mode": "0",
    # 頭尾最多走 20 分鐘（TDX 預設 10）：離車站 900 公尺的影城，10 分鐘時只會排到公車
    # （2026-10-21 實測、使用者決定）。改了這裡，路線快取的版本要換（5.3）
    "first_mile_time": "20",
    "last_mile_time": "20",
}
# 回傳的時間不準，要多要幾條才篩得出合格的
MIN_TOP = 5
# 用 depart 查時，TDX 常給比要求更早出門的路線（實測：要 17:30 給 17:17～17:28），篩完會一條不剩。
# 所以先用「要求時間＋15 分鐘」查；還是篩光就再延 15 分鐘，最多 2 次（2026-10-21 使用者決定）
DEPART_SHIFT = timedelta(minutes=15)
DEPART_RETRIES = 2
# 用 arrival 查時，最晚到家比末班車晚太多，TDX 會回 40001 或篩完一條不剩（2026-10-27 實測：
# 桃園站 → 渴望三期附近，指定 23:30、23:00 抵達回 40001，22:30 就查得到 19:05 到的末班車）。
# 所以往前 30 分鐘再查，最多 3 次【預設】（2026-10-27 使用者決定往前重查）
ARRIVAL_SHIFT = timedelta(minutes=30)
ARRIVAL_RETRIES = 3
# TDX 查不到路線、兩點又在 1 公里內就改排步行：出發站就是商圈代表點時，TDX 起訖點相同會回空的
# （2026-10-21 實測、使用者決定先查 TDX，查不到才改步行）
WALK_FALLBACK_M = 1000
# 收到 429（超過每分鐘次數）時等 60 秒再試一次（2026-10-21 使用者決定）
RATE_LIMIT_WAIT_SECONDS = 60
# 點數（5.5）：基礎服務每次 2 單位、進階服務 15 單位、旅運規劃（MaaS）不扣點
BASIC_UNITS = 2
ADVANCED_UNITS = 15

MODE_LABELS = {
    "TRA": "台鐵",
    "THSR": "高鐵",
    "Bus": "公車",
    "MRT": "捷運",
    "Metro": "捷運",
    "LRT": "輕軌",
}


class TdxError(Exception):
    pass


class TdxBadParams(TdxError):
    """TDX 回 404、錯誤代碼 40001（API spec params is wrong）。實測是「查不到路線」的另一種回法：
    起訖點很近（桃園站→統領威秀約 300 公尺）、深夜沒車（23:15 從中壢站出發）都會這樣，
    所以當作查不到路線（2026-10-21）。"""


class TdxQuotaExhausted(Exception):
    """本月點數用完（5.5）：停止呼叫，不重試。"""


@dataclass(frozen=True)
class TdxLeg:
    """一段搭車（transit section）。估車資用。"""

    mode: str
    from_name: str | None
    to_name: str | None
    from_lat: float
    from_lng: float
    to_lat: float
    to_lng: float

    @property
    def straight_meters(self) -> float:
        return haversine_m(self.from_lat, self.from_lng, self.to_lat, self.to_lng)


@dataclass(frozen=True)
class FareRates:
    """TDX 沒給車資時的估計（2026-10-20 決定先自己估，之後改查 TDX 票價 API）。

    軌道依直線距離 × 繞路係數 × 每公里單價，四捨五入到 1 元，不低於起跳價；公車每段一個固定價。
    數字是【預設】的粗估，結果會標成估計值。
    """

    detour: float = 1.15
    tra_per_km: float = 1.46
    tra_min: int = 15
    thsr_per_km: float = 3.8
    thsr_min: int = 40
    metro_per_km: float = 2.4
    metro_min: int = 20
    bus_per_leg: int = 18


@dataclass(frozen=True)
class TdxRoute:
    start_at: datetime  # 從起點出發
    end_at: datetime  # 走到終點
    depart_at: datetime  # 第一班車開
    arrive_at: datetime  # 最後一班車到
    board_name: str | None
    alight_name: str | None
    summary: str
    transfers: int
    fare: int | None  # TDX 只在全程公車時給車資
    legs: tuple[TdxLeg, ...] = ()

    def to_route(self, fare: int, fare_estimated: bool = False) -> Route:
        walk_before = math.ceil((self.depart_at - self.start_at).total_seconds() / 60)
        walk_after = math.ceil((self.end_at - self.arrive_at).total_seconds() / 60)
        return Route(
            summary=self.summary,
            fare=fare,
            depart_at=self.depart_at,
            arrive_at=self.arrive_at,
            board_name=self.board_name or "",
            alight_name=self.alight_name or "",
            walk_before=max(0, walk_before),
            walk_after=max(0, walk_after),
            transfers=self.transfers,
            fare_estimated=fare_estimated,
        )


def estimate_fare(route: "TdxRoute", rates: FareRates) -> int:
    total = 0
    for leg in route.legs:
        km = leg.straight_meters / 1000 * rates.detour
        if leg.mode == "Bus":
            total += rates.bus_per_leg
        elif leg.mode == "TRA":
            total += max(rates.tra_min, round(km * rates.tra_per_km))
        elif leg.mode == "THSR":
            total += max(rates.thsr_min, round(km * rates.thsr_per_km))
        else:  # 捷運、機捷、輕軌……
            total += max(rates.metro_min, round(km * rates.metro_per_km))
    return total


def _time(value: str) -> datetime:
    # 例如 2026-10-21T17:11:52 或 2026-06-28T21:56:50.0000000+08:00
    head = value[:19]
    dt = datetime.fromisoformat(head)
    return dt.replace(tzinfo=TZ)


def _label(transport: dict[str, Any]) -> str:
    mode = transport.get("mode") or ""
    label = MODE_LABELS.get(mode, mode)
    if mode == "TRA":
        headsign = transport.get("headsign")
        return f"{label}（往{headsign}）" if headsign else label
    if mode == "Bus":
        name = transport.get("name") or transport.get("shortName")
        return f"{label} {name}" if name else label
    return label or (transport.get("name") or "大眾運輸")


def parse_routes(payload: dict[str, Any]) -> list[TdxRoute]:
    routes = (payload.get("data") or {}).get("routes") or []
    out = []
    for rt in routes:
        transits = [s for s in rt.get("sections", []) if s.get("type") == "transit"]
        start, end = _time(rt["start_time"]), _time(rt["end_time"])
        if transits:
            first, last = transits[0], transits[-1]
            depart, arrive = _time(first["departure"]["time"]), _time(last["arrival"]["time"])
            board = first["departure"]["place"].get("name")
            alight = last["arrival"]["place"].get("name")
            summary = " → ".join(_label(s.get("transport", {})) for s in transits)
            legs = tuple(
                TdxLeg(
                    mode=s.get("transport", {}).get("mode") or "",
                    from_name=s["departure"]["place"].get("name"),
                    to_name=s["arrival"]["place"].get("name"),
                    from_lat=s["departure"]["place"]["location"]["lat"],
                    from_lng=s["departure"]["place"]["location"]["lng"],
                    to_lat=s["arrival"]["place"]["location"]["lat"],
                    to_lng=s["arrival"]["place"]["location"]["lng"],
                )
                for s in transits
            )
        else:  # 全程走路
            depart, arrive, board, alight, summary = start, end, None, None, "步行"
            legs = ()
        price = rt.get("total_price")
        out.append(
            TdxRoute(
                start_at=start,
                end_at=end,
                depart_at=depart,
                arrive_at=arrive,
                board_name=board,
                alight_name=alight,
                summary=summary,
                transfers=int(rt.get("transfers") or 0),
                fare=int(price) if price is not None else None,
                legs=legs,
            )
        )
    out.sort(key=lambda r: (r.start_at, r.end_at))
    return out


def walk_route(origin: Endpoint, dest: Endpoint, at: datetime, mode: TimeMode) -> Route | None:
    """1 公里內的步行「路線」：整段算在下車後的步行，時間軸只會顯示一段 `walk`，車資 0。"""
    meters = haversine_m(origin.lat, origin.lng, dest.lat, dest.lng)
    if meters > WALK_FALLBACK_M:
        return None
    minutes = walk_minutes(meters)
    start = at if mode == "depart" else at - timedelta(minutes=minutes)
    return Route(summary="步行", fare=0, depart_at=start, arrive_at=start,
                 board_name=origin.name, alight_name=origin.name, walk_after=minutes,
                 walk_only=True)  # fmt: skip


class TdxTransit:
    """真的 TDX。限流（每分鐘 5 次）和快取由外面的 CachedTransit 處理。"""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        r: redis.Redis,
        rates: FareRates | None = None,
        timeout: float = 10.0,
        retries: int = 2,
        http: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        limiter: Callable[[], None] | None = None,
        points_limit: int | None = None,
        on_rate_limited: Callable[[int], None] | None = None,
    ):
        """`limiter`：每次送出請求前呼叫（等每分鐘 5 次的額度），重試也算。
        `points_limit`：每月點數上限（單位）；有設就在每次請求前檢查並記帳（5.5）。
        `on_rate_limited`：收到 429、要等之前呼叫（參數是秒數），planner 用來推送「等待額度」。
        """
        if not client_id or not client_secret:
            raise TdxError("TDX_MODE=real 要先在 .env 填 TDX_CLIENT_ID、TDX_CLIENT_SECRET")
        self.client_id, self.client_secret = client_id, client_secret
        self.r = r
        self.rates = rates or FareRates()
        self.retries = retries
        self.http = http or httpx.Client(timeout=timeout)
        self.sleep = sleep
        self.limiter = limiter
        self.points_limit = points_limit
        self.on_rate_limited = on_rate_limited

    # ── token（5.3 A1）─────────────────────────────────────────

    def token(self) -> str:
        """先讀 Redis；沒有就搶鎖去換，沒搶到的等 1 秒再讀。"""
        for _ in range(30):
            cached = self.r.get(TOKEN_KEY)
            if cached:
                return cached
            lock = acquire(self.r, TOKEN_LOCK, ttl_ms=30_000)
            if lock:
                try:
                    return self._fetch_token()
                finally:
                    release(self.r, TOKEN_LOCK, lock)
            self.sleep(1)
        raise TdxError("等不到 TDX token")

    def _fetch_token(self) -> str:
        resp = self.http.post(
            TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            },
        )
        if resp.status_code != 200:
            raise TdxError(f"換 TDX token 失敗：HTTP {resp.status_code}")
        body = resp.json()
        ttl = max(60, int(body.get("expires_in", 86400)) - 300)  # 有效期限減 5 分鐘
        self.r.set(TOKEN_KEY, body["access_token"], ex=ttl)
        return body["access_token"]

    # ── 旅運規劃 ─────────────────────────────────────────────

    def get_basic(self, path: str, params: dict[str, str] | None = None) -> Any:
        """基礎服務，例如車站（3.5）：每次請求 2 單位。"""
        return self._get({"$format": "JSON", **(params or {})}, BASIC_URL + path, BASIC_UNITS)

    def get_advanced(self, path: str, params: dict[str, str] | None = None) -> Any:
        """進階服務，例如地理編碼（3.4）：每次請求 15 單位。"""
        return self._get({"$format": "JSON", **(params or {})}, ADVANCED_URL + path, ADVANCED_UNITS)

    def _before_request(self, units: int) -> None:
        if self.limiter:
            self.limiter()
        if units and self.points_limit is not None:
            if not has_room(self.r, "tdx_points", self.points_limit, units):
                raise TdxQuotaExhausted("TDX 本月點數用完，暫停呼叫（5.5）")
            add_usage(self.r, "tdx_points", units)

    def _get(self, params: dict[str, str], url: str = ROUTING_URL, units: int = 0) -> Any:
        """8.3：逾時或 5xx 最多重試 2 次（間隔 1、2 秒）；4xx 不重試；401 換一次 token；
        429 等 60 秒再試一次（不算在重試次數裡）。

        每次真的送出請求前都先等額度、記點數，重試也算，才不會超過 TDX 的上限。
        """
        refreshed = rate_limited = False
        attempt = 0
        while attempt <= self.retries:
            self._before_request(units)
            try:
                resp = self.http.get(
                    url,
                    params=params,
                    headers={"authorization": f"Bearer {self.token()}", "Accept-Encoding": "gzip"},
                )
            except httpx.TimeoutException:
                if attempt == self.retries:
                    raise TdxError("TDX 逾時") from None
                attempt += 1
                self.sleep(attempt)
                continue
            if resp.status_code == 401 and not refreshed:
                self.r.delete(TOKEN_KEY)
                refreshed = True
                attempt += 1
                continue
            if resp.status_code == 429 and not rate_limited:
                # 例如另一個人同時用同一把金鑰測試，我們的限流器算不到
                rate_limited = True
                log.warning("TDX 回 429，等 %d 秒再試", RATE_LIMIT_WAIT_SECONDS)
                if self.on_rate_limited:
                    self.on_rate_limited(RATE_LIMIT_WAIT_SECONDS)
                self.sleep(RATE_LIMIT_WAIT_SECONDS)
                continue
            if resp.status_code >= 500 and attempt < self.retries:
                attempt += 1
                self.sleep(attempt)
                continue
            if resp.status_code == 404 and '"code":40001' in resp.text.replace(" ", ""):
                when = params.get("depart") or params.get("arrival") or ""
                raise TdxBadParams(f"TDX HTTP 404（{when}）：{resp.text[:200]}")
            if resp.status_code != 200:
                raise TdxError(f"TDX HTTP {resp.status_code}：{resp.text[:200]}")
            return resp.json()
        raise TdxError("TDX 旅運規劃失敗")

    def route(
        self, origin: Endpoint, dest: Endpoint, at: datetime, mode: TimeMode, top: int = 1
    ) -> list[Route]:
        try:
            routes = self._route(origin, dest, at, mode, top)
        except TdxBadParams as exc:
            # 萬一真的是參數錯了，記錄裡查得到
            log.warning("TDX 回 40001，當作查不到路線：%s → %s，%s", origin.key, dest.key, exc)
            routes = []
        if not routes:
            walk = walk_route(origin, dest, at, mode)
            return [walk] if walk else []
        return routes[:top]

    def _route(
        self, origin: Endpoint, dest: Endpoint, at: datetime, mode: TimeMode, top: int
    ) -> list[Route]:
        near = haversine_m(origin.lat, origin.lng, dest.lat, dest.lng) <= WALK_FALLBACK_M
        if mode == "arrival":
            routes = []
            for k in range(ARRIVAL_RETRIES + 1):
                # 查詢時間往前提早，但還是照使用者要求的時間檢查
                try:
                    found = self._query(origin, dest, at - ARRIVAL_SHIFT * k, mode, top)
                except TdxBadParams as exc:
                    log.warning("TDX 回 40001，往前再查：%s → %s，%s", origin.key, dest.key, exc)
                    found = []
                routes = valid_routes(found, at, mode)
                # 1 公里內查不到就直接改走路（route），不必多花 TDX 的額度
                if routes or (near and not found):
                    break
            # 抵達期限：最晚出發的那班排第一（跟模擬版一樣），步驟 2 才算得出「最晚要離開」。
            # 原本照最晚抵達排，會拿到比較早出發、路上比較久的那條（2026-10-21 前端實測發現）；
            # 同一班出發時，先到的排前面
            routes.sort(key=lambda r: (-r.leave_at.timestamp(), r.reach_at))
        else:
            routes = []
            for k in range(1, DEPART_RETRIES + 2):
                # 查詢時間往後延，但還是照使用者要求的時間檢查
                found = self._query(origin, dest, at + DEPART_SHIFT * k, mode, top)
                if not found:  # TDX 根本查不到（不是時間太早被刷掉），往後延也沒用
                    break
                routes = valid_routes(found, at, mode)
                if routes:
                    break
            # 出發時間：最早抵達的排第一，步驟 2 才算得出「最早到得了」。原本照出門時間排，
            # 會拿到比較早出門、路上比較久的那條（2026-10-27 審查發現）；同時抵達的，晚出門的排前面
            routes.sort(key=lambda r: (r.reach_at, -r.leave_at.timestamp()))
        return routes

    def _query(
        self, origin: Endpoint, dest: Endpoint, at: datetime, mode: TimeMode, top: int
    ) -> list[Route]:
        params = {
            **FIXED_PARAMS,
            "origin": f"{origin.lat},{origin.lng}",
            "destination": f"{dest.lat},{dest.lng}",
            "top": str(max(top, MIN_TOP)),
            mode: at.astimezone(TZ).strftime("%Y-%m-%dT%H:%M:%S"),
        }
        return [
            p.to_route(p.fare)
            if p.fare is not None
            else p.to_route(estimate_fare(p, self.rates), fare_estimated=True)
            for p in parse_routes(self._get(params))
        ]
