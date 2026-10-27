"""TDX 路線快取（規格書 5.2、5.3）。

- key：`tdx:route:v1:{起點}:{終點}:{dep|arr}:{時段}:{top}`，起點終點用 sta12、cin3 這種代碼
- 時間取整到 15 分鐘：`depart` 往後、`arrival` 往前，保證不會錯過車
- 過期 6 小時；Redis 出問題時直接查 TDX，不讓規劃失敗
- 改了 TDX 的固定參數就把 v1 換成 v2，舊的快取放著自然過期
"""

import json
import logging
from collections.abc import Callable
from dataclasses import replace
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import redis

from app.planning.types import Route
from app.transit import Endpoint, TimeMode, Transit, valid_routes

log = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Taipei")
VERSION = "v1"
SLOT_MINUTES = 15
TTL_SECONDS = 6 * 3600
# 查不到路線的結果只存 10 分鐘：短時間內不重複呼叫，也不會卡好幾個小時（2026-10-21 使用者決定）
EMPTY_TTL_SECONDS = 10 * 60


def round_slot(at: datetime, mode: TimeMode, minutes: int = SLOT_MINUTES) -> datetime:
    local = at.astimezone(TZ)
    base = local.replace(minute=0, second=0, microsecond=0)
    offset = local - base
    step = timedelta(minutes=minutes)
    floor = base + step * (offset // step)
    if mode == "arrival" or floor == local:
        return floor
    return floor + step


def route_cache_key(
    origin: str, dest: str, slot: datetime, mode: TimeMode, top: int, version: str = VERSION
) -> str:
    m = "dep" if mode == "depart" else "arr"
    return f"tdx:route:{version}:{origin}:{dest}:{m}:{slot.astimezone(TZ):%Y%m%d%H%M}:{top}"


_FIELDS = ("summary", "fare", "board_name", "alight_name", "walk_before", "walk_after", "transfers",
           "fare_estimated", "walk_only")  # fmt: skip


def dump_routes(routes: list[Route]) -> str:
    return json.dumps(
        [
            {
                **{f: getattr(r, f) for f in _FIELDS},
                "depart_at": r.depart_at.isoformat(),
                "arrive_at": r.arrive_at.isoformat(),
            }
            for r in routes
        ],
        ensure_ascii=False,
    )


def load_routes(raw: str) -> list[Route]:
    return [
        Route(
            **{f: d[f] for f in _FIELDS if f in d},
            depart_at=datetime.fromisoformat(d["depart_at"]),
            arrive_at=datetime.fromisoformat(d["arrive_at"]),
        )
        for d in json.loads(raw)
    ]


def _walk_at(route: Route, at: datetime, mode: TimeMode) -> Route:
    start = at if mode == "depart" else at - timedelta(minutes=route.walk_after)
    return replace(route, depart_at=start, arrive_at=start)


class CachedTransit:
    """包住真的（或模擬版）TDX：先查快取，沒有才呼叫，並把結果存 6 小時。

    `before_call` 只在真的要呼叫 TDX 時執行，用來等 TDX 每分鐘 5 次的限流。
    """

    def __init__(
        self,
        inner: Transit,
        client: redis.Redis,
        before_call: Callable[[], None] | None = None,
        ttl_seconds: int = TTL_SECONDS,
        version: str = VERSION,
        slot_minutes: int = SLOT_MINUTES,
    ):
        self.inner, self.client = inner, client
        self.before_call = before_call
        self.ttl_seconds = ttl_seconds
        self.slot_minutes = slot_minutes
        # 模擬版和真的 TDX 分開存，切換模式時才不會拿到另一邊的路線
        self.version = version

    def route(
        self, origin: Endpoint, dest: Endpoint, at: datetime, mode: TimeMode, top: int = 1
    ) -> list[Route]:
        slot = round_slot(at, mode, self.slot_minutes)
        key = route_cache_key(origin.key, dest.key, slot, mode, top, self.version)
        cached = self._get(key)
        if cached is not None:
            routes = cached
        else:
            if self.before_call:
                self.before_call()
            routes = valid_routes(self.inner.route(origin, dest, slot, mode, top), slot, mode)
            self._set(key, routes)
        # 步行（TDX 查不到、1 公里內）不用等車，照原本要求的時間走，不跟著取整
        routes = [_walk_at(x, at, mode) if x.walk_only else x for x in routes]
        # 取整後的時間比使用者要求的更保守，結果一定符合原本的要求；這裡再確認一次
        return valid_routes(routes, at, mode)

    def _get(self, key: str) -> list[Route] | None:
        try:
            raw = self.client.get(key)
        except redis.RedisError as exc:
            log.warning("讀路線快取失敗，直接查 TDX：%r", exc)
            return None
        return None if raw is None else load_routes(raw)

    def _set(self, key: str, routes: list[Route]) -> None:
        try:
            ttl = self.ttl_seconds if routes else min(self.ttl_seconds, EMPTY_TTL_SECONDS)
            self.client.set(key, dump_routes(routes), ex=ttl)
        except redis.RedisError as exc:
            # 5.8：快取寫入失敗時忽略
            log.warning("寫路線快取失敗：%r", exc)
