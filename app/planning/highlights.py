"""方案卡的特色標籤（規格書 6.5）。

第一名固定是「最推薦」。第二、三名依名次，各取「它在所有方案中最好、還沒被用掉」的一項，
順序是最省 → 最穩 → 最早回到站 → 走最少路；同分都算最好；一項都沒有時是 None【預設】。
`reason` 裡的數字都由程式計算，不提 Jev、AI、機率。文字是【預設】。
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class PlanMetrics:
    cost_total: int
    min_buffer: int
    home_at: datetime
    walk_minutes_total: int


_COUNT = {1: "一", 2: "兩", 3: "三", 4: "四", 5: "五"}

# key、標籤、取值（越小越好）、理由
_RULES: list[tuple[str, str, Callable[[PlanMetrics], float], Callable[..., str]]] = [
    ("cheapest", "最省", lambda p: p.cost_total,
     lambda p, n, _: f"每人 {p.cost_total:,} 元，{_COUNT.get(n, n)}個方案中最便宜"),
    ("safest", "最穩", lambda p: -p.min_buffer,
     lambda p, n, _: f"最緊的空檔也有 {p.min_buffer} 分鐘"),
    ("earliest_return", "最早回到站", lambda p: p.home_at.timestamp(),
     lambda p, n, station: f"{p.home_at:%H:%M} 就回到{station}"),
    ("shortest_walk", "走最少路", lambda p: p.walk_minutes_total,
     lambda p, n, _: f"全程步行約 {p.walk_minutes_total} 分鐘"),
]  # fmt: skip

RECOMMENDED = {"key": "recommended", "label": "最推薦", "reason": "最符合你選的條件"}


def assign_highlights(plans: Sequence[PlanMetrics], station: str) -> list[dict[str, Any] | None]:
    if not plans:
        return []
    n = len(plans)
    best = {key: min(value(p) for p in plans) for key, _, value, _ in _RULES}
    used: set[str] = set()
    result: list[dict[str, Any] | None] = [dict(RECOMMENDED)]
    for plan in plans[1:]:
        chosen = None
        for key, label, value, reason in _RULES:
            if key not in used and value(plan) == best[key]:
                chosen = {"key": key, "label": label, "reason": reason(plan, n, station)}
                used.add(key)
                break
        result.append(chosen)
    return result
