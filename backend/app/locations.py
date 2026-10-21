"""自選的出發位置：輸入地址或地標名稱，用 TDX 地理編碼查座標（規格書 6.2，2026-10-21 使用者決定）。

- 只回傳桃園市的結果；地址開頭不是「桃園市」的刷掉
- 看起來像地址（有路、街、段，或數字＋號）就查地址，否則查地標；只查一種（每次 15 單位點數）。
  地標查不到時不改查地址：實測「台北101」補上桃園市去查地址，會回「桃園市桃園區」的區中心
- 只到區的結果不收：沒有名稱、或名稱就是「桃園市○○區」，地址又沒有路、街的
  （實測「台北101」查地標會回一筆名稱、地址都是「桃園市桃園區」的）
- 地址沒寫縣市就補「桃園市」（實測「中壢區中北路200號」查不到，加上就查得到）
- 地址的結果沒有名稱，用地址當名稱
- TDX 是同步的用戶端，由 API 放到執行緒裡跑；每分鐘 5 次的額度不等，搶不到就請使用者稍後再試
"""

import re
from collections.abc import Callable

from app.collectors.tdx_geocode import GeoHit

CITY = "桃園市"
MAX_RESULTS = 10
CACHE_TTL_SECONDS = 7 * 24 * 3600
_ADDRESS_HINT = re.compile(r"(路|街|大道|段)|\d+\s*號")
_DISTRICT = re.compile(r"桃園[市縣]\S{1,4}[區市鄉鎮]")


def normalize(q: str) -> str:
    return re.sub(r"\s+", " ", q).strip()


def cache_key(q: str) -> str:
    return f"geo:search:v1:{q}"


def looks_like_address(q: str) -> bool:
    return bool(_ADDRESS_HINT.search(q))


def search(
    markname: Callable[[str, str], list[GeoHit]],
    address: Callable[[str, str], list[GeoHit]],
    q: str,
) -> list[GeoHit]:
    if looks_like_address(q):
        full = q if q.startswith(("桃園市", "桃園縣")) else CITY + q
        hits = address(full, CITY)
    else:
        hits = markname(q, CITY)
    seen, out = set(), []
    for h in hits:
        coarse = not (h.address and looks_like_address(h.address))
        if coarse and (h.name is None or h.name == h.address or _DISTRICT.fullmatch(h.name)):
            continue
        if h.name is None:
            h = GeoHit(name=h.address, address=h.address, lat=h.lat, lng=h.lng)
        key = (h.name, round(h.lat, 4), round(h.lng, 4))
        if key not in seen:
            seen.add(key)
            out.append(h)
    return out[:MAX_RESULTS]
