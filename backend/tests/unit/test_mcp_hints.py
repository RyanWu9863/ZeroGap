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
