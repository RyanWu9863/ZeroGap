"""整合測試：需要 `docker compose up -d postgres redis`。

每次測試開始時重建 `zerogap_test` 資料庫並跑 migration，不會碰到開發用的資料。
連不上資料庫時整批略過。
"""

import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.config import get_settings

TEST_DB = "zerogap_test"


def _test_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        return url
    return make_url(get_settings().database_url).set(database=TEST_DB).render_as_string(False)


def pytest_collection_modifyitems(items):
    for item in items:
        if "integration" in str(item.fspath):
            item.add_marker(pytest.mark.integration)


@pytest.fixture(scope="session")
def db_url() -> str:
    url = make_url(_test_url())
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"連不上 PostgreSQL（{exc.__class__.__name__}），請先 docker compose up -d")
    finally:
        admin.dispose()

    rendered = url.render_as_string(hide_password=False)
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", rendered.replace("%", "%%"))
    command.upgrade(cfg, "head")
    return rendered


@pytest.fixture(scope="session")
def engine(db_url):
    eng = create_engine(db_url)
    yield eng
    eng.dispose()


@pytest.fixture
def session(engine):
    with sessionmaker(engine, expire_on_commit=False)() as s:
        yield s


@pytest.fixture(scope="session")
def redis_url() -> str:
    """測試用 Redis 的第 15 號資料庫，不碰開發用的資料。"""
    import redis

    url = os.environ.get("TEST_REDIS_URL") or get_settings().redis_url.rsplit("/", 1)[0] + "/15"
    try:
        redis.Redis.from_url(url, socket_connect_timeout=1).ping()
    except redis.RedisError as exc:
        pytest.skip(f"連不上 Redis（{exc.__class__.__name__}），請先 docker compose up -d")
    return url
