"""資料庫連線：API 用非同步、worker 用同步，都用 psycopg 3（規格書 4.1）。"""

from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings


@lru_cache
def sync_engine() -> Engine:
    return create_engine(get_settings().database_url, pool_pre_ping=True)


@lru_cache
def async_engine() -> AsyncEngine:
    return create_async_engine(get_settings().database_url, pool_pre_ping=True)


def sync_session() -> sessionmaker:
    return sessionmaker(sync_engine(), expire_on_commit=False)


def async_session() -> async_sessionmaker:
    return async_sessionmaker(async_engine(), expire_on_commit=False)
