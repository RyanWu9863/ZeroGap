"""交通查詢：TDX 旅運規劃的介面與模擬版（規格書 3.2）。

真的 TDX 用戶端第二階段才做（要金鑰）。介面是同步的，因為只在 RQ worker 裡呼叫。
路線快取放在 `app.redis_utils.cache`，不在這裡。
"""

import math
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Literal, Protocol

from app.planning.types import Route

TimeMode = Literal["depart", "arrival"]
EndpointKind = Literal["station", "hub", "cinema", "restaurant"]


@dataclass(frozen=True)
class Endpoint:
    key: str  # 快取 key 用的代碼，例如 sta12、hub2、cin3（5.2）
    kind: EndpointKind
    name: str
    lat: float
    lng: float
    rail: bool = False  # 是不是軌道車站（模擬版用來決定叫「台鐵」還是「公車」）


class Transit(Protocol):
    def route(
        self, origin: Endpoint, dest: Endpoint, at: datetime, mode: TimeMode, top: int = 1
    ) -> list[Route]:
        """`depart`：依出發時間由早到晚；`arrival`：依抵達時間由晚到早。最多 `top` 條。"""
        ...


def valid_routes(routes: list[Route], at: datetime, mode: TimeMode) -> list[Route]:
    """TDX 查不到路線時會自動放寬時間，所以要再檢查一次（3.2）。"""
    if mode == "depart":
        return [r for r in routes if r.leave_at >= at]
    return [r for r in routes if r.reach_at <= at]


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class MockTransit:
    """模擬版 TDX（示意）。結果固定、可重現。

    - 路程 = 直線距離 × 1.4；時速 30 公里，再加 5 分鐘
    - 每 10 分鐘一班（整點、10 分……），05:30～23:50 發車
    - 只回傳要求時間前後 3 小時內的班次
    - 車資 15 元 ＋ 每公里 2 元，四捨五入到 5 元
    - 兩端都是軌道站叫「台鐵」，否則叫「公車」；影城、餐廳那一端要走 5 分鐘到站牌
    """

    DETOUR = 1.4
    KMH = 30.0
    EXTRA_MINUTES = 5
    HEADWAY_MINUTES = 10
    FIRST = time(5, 30)
    LAST = time(23, 50)
    WINDOW = timedelta(hours=3)
    STOP_WALK_MINUTES = 5

    def route(
        self, origin: Endpoint, dest: Endpoint, at: datetime, mode: TimeMode, top: int = 1
    ) -> list[Route]:
        km = haversine_m(origin.lat, origin.lng, dest.lat, dest.lng) / 1000 * self.DETOUR
        ride = timedelta(minutes=math.ceil(km / self.KMH * 60) + self.EXTRA_MINUTES)
        fare = max(15, int(math.floor((15 + 2 * km) / 5 + 0.5)) * 5)
        walk_before = self._stop_walk(origin)
        walk_after = self._stop_walk(dest)
        headway = timedelta(minutes=self.HEADWAY_MINUTES)

        departures: list[datetime] = []
        if mode == "depart":
            t = self._grid(at + timedelta(minutes=walk_before), up=True)
            while t <= at + self.WINDOW and len(departures) < top:
                if self._in_service(t):
                    departures.append(t)
                t += headway
        else:
            t = self._grid(at - timedelta(minutes=walk_after) - ride, up=False)
            while t >= at - self.WINDOW and len(departures) < top:
                if self._in_service(t):
                    departures.append(t)
                t -= headway

        both_rail = origin.rail and dest.rail
        return [
            Route(
                summary="台鐵" if both_rail else "公車",
                fare=fare,
                depart_at=d,
                arrive_at=d + ride,
                board_name=self._stop_name(origin),
                alight_name=self._stop_name(dest),
                walk_before=walk_before,
                walk_after=walk_after,
            )
            for d in departures
        ]

    def _stop_walk(self, p: Endpoint) -> int:
        return 0 if p.kind in ("station", "hub") else self.STOP_WALK_MINUTES

    @staticmethod
    def _stop_name(p: Endpoint) -> str:
        return p.name if p.kind in ("station", "hub") else f"{p.name}附近站牌"

    def _grid(self, at: datetime, up: bool) -> datetime:
        base = at.replace(second=0, microsecond=0)
        if base < at:  # 有秒數時先進到下一分鐘
            base += timedelta(minutes=1) if up else timedelta(0)
        rem = base.minute % self.HEADWAY_MINUTES
        if rem == 0:
            return base
        if up:
            return base + timedelta(minutes=self.HEADWAY_MINUTES - rem)
        return base - timedelta(minutes=rem)

    def _in_service(self, t: datetime) -> bool:
        return self.FIRST <= t.time() <= self.LAST
