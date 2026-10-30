"""相對日期換算（mcp-eval v4）：AI 直接照抄使用者的說法，由伺服器換算成日期。"""

from datetime import date

import pytest

from app.relative_dates import DateNotUnderstood, resolve_date

FRI = date(2026, 10, 30)  # 週五
SUN = date(2026, 11, 1)  # 週日


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("2026-10-31", date(2026, 10, 31)),
        ("今天", date(2026, 10, 30)),
        ("明天", date(2026, 10, 31)),
        ("後天", date(2026, 11, 1)),
        ("週六", date(2026, 10, 31)),
        ("星期日", date(2026, 11, 1)),
        ("禮拜天", date(2026, 11, 1)),
        ("週五", date(2026, 10, 30)),  # 今天就是週五 → 今天
        ("週一", date(2026, 11, 2)),  # 今天或之後最近的週一
        ("這週日", date(2026, 11, 1)),
        ("這禮拜六", date(2026, 10, 31)),
        ("本週五", date(2026, 10, 30)),
        ("下週六", date(2026, 11, 7)),
        ("下禮拜一", date(2026, 11, 2)),
        ("下星期日", date(2026, 11, 8)),
        ("12月25日", date(2026, 12, 25)),
        ("12月25號", date(2026, 12, 25)),
        ("12/25", date(2026, 12, 25)),
        ("  明天 ", date(2026, 10, 31)),  # 前後空白
    ],
)
def test_resolves(text, expected):
    assert resolve_date(text, FRI) == expected


def test_this_week_day_already_passed_suggests_next_week():
    with pytest.raises(DateNotUnderstood) as exc:
        resolve_date("這週二", FRI)
    assert "已經過了" in str(exc.value)
    assert "2026-11-03" in str(exc.value)  # 下週二


def test_sunday_this_saturday_is_yesterday():
    with pytest.raises(DateNotUnderstood) as exc:
        resolve_date("這週六", SUN)
    assert "2026-11-07" in str(exc.value)  # 建議下週六


@pytest.mark.parametrize("text", ["1/5", "2月30日", "2026-13-01"])
def test_past_or_invalid_month_day(text):
    with pytest.raises(DateNotUnderstood):
        resolve_date(text, FRI)


@pytest.mark.parametrize("text", ["週末", "找一天", "下禮拜", "十二月二十五號", ""])
def test_ambiguous_asks_user(text):
    with pytest.raises(DateNotUnderstood) as exc:
        resolve_date(text, FRI)
    assert "使用者" in str(exc.value)
