"""OSM `opening_hours` 的常見子集，示意資料和 OSM 來源的餐廳都用這個格式。

支援：`24/7`；用 `;` 分開的規則；星期 `Mo-Fr`、`Sa,Su`（省略代表每天）；
時段 `11:00-14:00,17:00-21:00`，結束早於開始代表跨到隔天；`off`、`closed`。
後面的規則會覆蓋前面同一天的規則（OSM 的規定）。
其他寫法（國定假日 PH、月份、`||`、日出日落……）一律回傳 None，當成「不知道營業時間」。
"""

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
_DAY_RE = re.compile(r"^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$")
_SPAN_RE = re.compile(r"^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$")

# 每天的時段：(開始距當天 0 點幾分鐘, 結束距當天 0 點幾分鐘)；跨夜時結束會大於 1440
Spans = tuple[tuple[int, int], ...]


@dataclass(frozen=True)
class OpeningHours:
    by_weekday: tuple[Spans, ...]  # 星期一到星期日

    @classmethod
    def parse(cls, text: str | None) -> "OpeningHours | None":
        if not text or not text.strip():
            return None
        text = text.strip()
        if text == "24/7":
            return cls(by_weekday=tuple(((0, 1440),) for _ in range(7)))
        week: list[Spans] = [() for _ in range(7)]
        for rule in text.split(";"):
            rule = rule.strip()
            if not rule:
                continue
            parsed = _parse_rule(rule)
            if parsed is None:
                return None
            days, spans = parsed
            for d in days:
                week[d] = spans
        return cls(by_weekday=tuple(week))

    def interval_containing(self, at: datetime) -> tuple[datetime, datetime] | None:
        """回傳包含 `at` 的營業時段 (開始, 結束)，開始 ≤ at < 結束；沒有就回傳 None。

        會一起看前一天跨夜到今天的時段。`at` 要帶時區。
        """
        for day in (at.date(), at.date() - timedelta(days=1)):
            for start_min, end_min in self.by_weekday[day.weekday()]:
                start = _at_minutes(day, start_min, at)
                end = _at_minutes(day, end_min, at)
                if start <= at < end:
                    return start, end
        return None

    def next_opening(self, at: datetime, within_minutes: int) -> tuple[datetime, datetime] | None:
        """`at` 之後 `within_minutes` 分鐘內開門的時段（早到時等開門用）。已經開著回傳 None。"""
        if self.interval_containing(at) is not None:
            return None
        limit = at + timedelta(minutes=within_minutes)
        best = None
        for day in (at.date(), at.date() + timedelta(days=1)):
            for start_min, end_min in self.by_weekday[day.weekday()]:
                start = _at_minutes(day, start_min, at)
                if at < start <= limit and (best is None or start < best[0]):
                    best = (start, _at_minutes(day, end_min, at))
        return best


def _at_minutes(day: date, minutes: int, like: datetime) -> datetime:
    return datetime.combine(day, time(0), tzinfo=like.tzinfo) + timedelta(minutes=minutes)


def _parse_rule(rule: str) -> tuple[list[int], Spans] | None:
    head, _, rest = rule.partition(" ")
    if _parse_days(head) is not None:
        days, body = _parse_days(head), rest.strip()
    else:
        days, body = list(range(7)), rule
    if body in ("off", "closed"):
        return days, ()
    spans: list[tuple[int, int]] = []
    for part in body.split(","):
        m = _SPAN_RE.match(part.strip())
        if not m:
            return None
        h1, m1, h2, m2 = (int(g) for g in m.groups())
        if h1 > 24 or h2 > 24 or m1 > 59 or m2 > 59:
            return None
        start, end = h1 * 60 + m1, h2 * 60 + m2
        if end <= start:
            end += 1440  # 跨到隔天
        spans.append((start, end))
    return days, tuple(spans)


def _parse_days(selector: str) -> list[int] | None:
    days: list[int] = []
    for part in selector.split(","):
        m = _DAY_RE.match(part)
        if not m:
            return None
        first = _DAYS.index(m.group(1))
        last = _DAYS.index(m.group(2)) if m.group(2) else first
        if last >= first:
            days.extend(range(first, last + 1))
        else:  # 例如 Fr-Mo
            days.extend([*range(first, 7), *range(0, last + 1)])
    return days
