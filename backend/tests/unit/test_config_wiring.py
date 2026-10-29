"""設定改了要有作用（bug 清單 L3）：最晚到家的換算、路線快取、MCP 的步行上限。"""

import os
import subprocess
import sys
from datetime import datetime
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest

from app.config import get_settings
from app.redis_utils.cache import CachedTransit
from app.transit import Endpoint

TZ = ZoneInfo("Asia/Taipei")


@pytest.fixture
def settings_env(monkeypatch):
    def apply(**env):
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        get_settings.cache_clear()

    yield apply
    get_settings.cache_clear()


def test_plan_request_uses_latest_home_settings(settings_env):
    from app.schemas import PlanRequest

    settings_env(LATEST_HOME_CUTOFF_HOUR="7", LATEST_HOME_MAX_HOUR_NEXT_DAY="3")
    req = PlanRequest.model_validate(
        {
            "area": "taoyuan", "origin_station_id": 1, "date": "2026-10-22",
            "earliest_departure": "17:00", "latest_home": "03:00", "order": "movie_first",
            "budget_per_person": 1000, "max_walk_minutes": 12,
        }
    )  # fmt: skip
    assert req.resolved_times()[1] == datetime(2026, 10, 23, 3, tzinfo=TZ)


def test_cached_transit_uses_slot_minutes_and_ttl():
    inner, client = MagicMock(), MagicMock()
    inner.route.return_value = []
    client.get.return_value = None
    a = Endpoint("st1", "station", "中壢", 24.95, 121.22, rail=True)
    b = Endpoint("st2", "station", "桃園", 24.99, 121.31, rail=True)
    transit = CachedTransit(inner, client, ttl_seconds=1800, slot_minutes=30)
    transit.route(a, b, datetime(2026, 10, 22, 18, 7, tzinfo=TZ), "depart")
    assert inner.route.call_args.args[2] == datetime(2026, 10, 22, 18, 30, tzinfo=TZ)
    assert ":202610221830:" in client.set.call_args.args[0]


def test_mcp_walk_options_follow_settings():
    # 選項在 import 時從設定讀；用子程序帶不同的設定，不影響其他測試
    # 參數是 Annotated[Literal[...], Field(...)]；設定裡沒有 12 時，預設值取中間的選項
    code = (
        "from typing import get_args; from app import mcp; "
        "ann = get_args(mcp.plan_date.__annotations__['max_walk_minutes'])[0]; "
        "print(list(get_args(ann)), mcp.WALK_DEFAULT)"
    )
    env = {**os.environ, "WALK_LIMIT_OPTIONS": "[5, 10, 30]"}
    out = subprocess.run(
        [sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True
    )
    assert out.stdout.strip() == "[5, 10, 30] 10"
