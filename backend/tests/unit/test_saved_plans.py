"""分享連結的存、讀、組網址（規格書 6.8）。不需要 Docker：用記憶體裡的假 Redis。"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
import redis

from app import saved_plans
from app.config import Settings

JOB = "a" * 32
NOW = datetime(2026, 11, 7, 21, 3, tzinfo=ZoneInfo("Asia/Taipei"))


def settings(**values) -> Settings:
    return Settings(_env_file=None, **values)


class MemoryRedis:
    def __init__(self):
        self.data: dict[str, str] = {}
        self.ex: int | None = None

    async def set(self, key, value, ex=None):
        self.data[key] = value
        self.ex = ex

    async def get(self, key):
        return self.data.get(key)


class BrokenRedis:
    async def set(self, *args, **kwargs):
        raise redis.RedisError("OOM command not allowed")


def test_share_url_is_none_without_base():
    assert saved_plans.share_url(settings(), JOB) is None


def test_share_url_strips_trailing_slash():
    s = settings(public_web_base_url="https://zerogap.example/")
    assert saved_plans.share_url(s, JOB) == f"https://zerogap.example/p/{JOB}"


@pytest.mark.parametrize(
    ("value", "ok"),
    [
        (JOB, True),
        ("A" * 32, False),
        ("a" * 31, False),
        ("a" * 33, False),
        ("g" * 32, False),
        ("../" + "a" * 29, False),
    ],
)
def test_job_id_pattern(value, ok):
    assert bool(saved_plans.JOB_ID_RE.fullmatch(value)) is ok


def test_not_found_message_uses_ttl_days():
    assert saved_plans.not_found_message(settings()) == "找不到這份行程，可能已經超過 7 天"
    assert "3 天" in saved_plans.not_found_message(settings(saved_plan_ttl_seconds=3 * 86400))


async def test_save_then_load_round_trip():
    r = MemoryRedis()
    assert (
        await saved_plans.save_plan(r, settings(), JOB, {"area": "taoyuan"}, {"plans": []}, NOW)
        is True
    )
    assert r.ex == 7 * 24 * 3600
    assert await saved_plans.load_plan(r, JOB) == {
        "job_id": JOB,
        "request": {"area": "taoyuan"},
        "result": {"plans": []},
        "created_at": "2026-11-07T21:03:00+08:00",
        "expires_at": "2026-11-14T21:03:00+08:00",
    }


async def test_load_missing_is_none():
    assert await saved_plans.load_plan(MemoryRedis(), JOB) is None


async def test_save_returns_false_when_redis_fails():
    assert await saved_plans.save_plan(BrokenRedis(), settings(), JOB, {}, {}, NOW) is False
