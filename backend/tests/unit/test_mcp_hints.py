"""MCP 層的純函式（mcp-eval v4）：日期參數換算、can_plan／tell_user、INSTRUCTIONS。"""

from datetime import date

import pytest
from mcp.server.mcpserver.exceptions import ToolError

from app.mcp import _date_param

FRI = date(2026, 10, 30)


def test_date_param_passes_iso_and_none():
    assert _date_param("2026-10-31", FRI) == "2026-10-31"
    assert _date_param(None, FRI) is None


def test_date_param_resolves_relative():
    assert _date_param("週六", FRI) == "2026-10-31"


def test_date_param_error_is_validation_error_for_ai():
    with pytest.raises(ToolError) as exc:
        _date_param("找一天", FRI)
    assert str(exc.value).startswith("VALIDATION_ERROR：date：")


AREAS = {
    "counties": [
        {"code": "Taoyuan", "name": "桃園市", "has_open_areas": True},
        {"code": "Taipei", "name": "臺北市", "has_open_areas": False},
    ],
    "areas": [
        {"code": "zhongli", "name": "中壢", "is_open": True},
        {"code": "qingpu", "name": "青埔", "is_open": False},
        {"code": "bade", "name": "八德", "is_open": True},
    ],
}


def test_area_hints_closed_area_and_county():
    from app.mcp import _area_hints

    out = _area_hints(AREAS)
    qingpu = next(a for a in out["areas"] if a["code"] == "qingpu")
    assert qingpu["can_plan"] is False
    assert "中壢" in qingpu["tell_user"] and "八德" in qingpu["tell_user"]
    taipei = next(c for c in out["counties"] if c["code"] == "Taipei")
    assert taipei["can_plan"] is False and "桃園市" in taipei["tell_user"]
    assert "can_plan" not in next(a for a in out["areas"] if a["code"] == "zhongli")


def test_coverage_hints_no_data():
    from app.mcp import _coverage_hints

    out = _coverage_hints({"area": "bade", "available_dates": []}, None)
    assert out["can_plan"] is False and "沒有場次資料" in out["tell_user"]


def test_coverage_hints_date_out_of_range():
    from app.mcp import _coverage_hints

    out = _coverage_hints(
        {"area": "zhongli", "available_dates": ["2026-10-30", "2026-11-06"]}, "2026-12-25"
    )
    assert out["can_plan"] is False
    for day in ("2026-12-25", "2026-10-30", "2026-11-06"):
        assert day in out["tell_user"]


def test_coverage_hints_ok_adds_nothing():
    from app.mcp import _coverage_hints

    src = {"area": "zhongli", "available_dates": ["2026-10-30"]}
    assert _coverage_hints(src, "2026-10-30") == src
