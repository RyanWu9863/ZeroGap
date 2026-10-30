"""相對日期換算：「明天」「週六」「下週日」「12/25」→ date（mcp-eval v4）。

小模型很難算星期（v3：通過驗證的 9 次全都差在日期），所以由伺服器換算。
規則：一週是週一～週日；看不懂或已經過了就丟 DateNotUnderstood，訊息寫給 AI 看。
"""

import re
from datetime import date, timedelta

# date.weekday()：週一是 0、週日是 6；「日」「天」都是週日
_WEEKDAYS = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}
_RELATIVE_DAYS = {"今天": 0, "明天": 1, "後天": 2}
_WEEKDAY_RE = re.compile(r"(這|本|下)?(?:週|周|星期|禮拜)([一二三四五六日天])")
_MONTH_DAY_RE = re.compile(r"(\d{1,2})(?:月(\d{1,2})[日號]|/(\d{1,2}))")
_ISO_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


class DateNotUnderstood(ValueError):
    """看不懂或已經過了；訊息直接告訴 AI 要問使用者什麼。"""


def resolve_date(text: str, today: date) -> date:
    s = text.strip()
    if _ISO_RE.fullmatch(s):
        try:
            return date.fromisoformat(s)
        except ValueError:
            raise DateNotUnderstood(f"「{s}」不是存在的日期，請問使用者是哪一天") from None
    if s in _RELATIVE_DAYS:
        return today + timedelta(days=_RELATIVE_DAYS[s])
    if m := _WEEKDAY_RE.fullmatch(s):
        return _weekday(s, m.group(1), _WEEKDAYS[m.group(2)], today)
    if m := _MONTH_DAY_RE.fullmatch(s):
        return _month_day(s, int(m.group(1)), int(m.group(2) or m.group(3)), today)
    raise DateNotUnderstood(
        f"看不懂「{s}」是哪一天（可以用今天、明天、週六、下週日、12/25），請問使用者"
    )


def _weekday(s: str, which: str | None, weekday: int, today: date) -> date:
    if which is None:  # 「週六」：今天或之後最近的那一天
        return today + timedelta(days=(weekday - today.weekday()) % 7)
    monday = today - timedelta(days=today.weekday())
    if which == "下":
        return monday + timedelta(days=7 + weekday)
    day = monday + timedelta(days=weekday)  # 這週、本週
    if day < today:
        # 例如週日說「這週六」：有些人心裡想的是下週六，不要替使用者猜
        later = day + timedelta(days=7)
        raise DateNotUnderstood(
            f"「{s}」（{day.isoformat()}）已經過了，請問使用者是不是下一週的（{later.isoformat()}）"
        )
    return day


def _month_day(s: str, month: int, day_of_month: int, today: date) -> date:
    try:
        day = date(today.year, month, day_of_month)
    except ValueError:
        raise DateNotUnderstood(f"「{s}」不是存在的日期，請問使用者是哪一天") from None
    if day < today:
        raise DateNotUnderstood(f"「{s}」（{day.isoformat()}）已經過了，請問使用者是哪一天")
    return day
