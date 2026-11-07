"""完整規劃後決策紀錄寫進 decision_records（要 PostgreSQL、Redis，資料表由 alembic upgrade 建立）。

示意種子資料 ＋ 模擬版 TDX、Jev、Google，做法和 test_planner_trace.py 相同。
"""

import json
import logging

import pytest
import redis
from sqlalchemy import select

from app.models import DecisionRecordRow
from tests.integration.conftest import reseed
from tests.integration.test_planner import DAY, SecondPickLlm, UnsureJev, request
from tests.integration.test_planner_trace import run


@pytest.fixture(scope="module", autouse=True)
def seeded(engine):
    reseed(engine, DAY)


@pytest.fixture
def r(redis_url):
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    client.flushdb()
    yield client
    client.flushdb()


def rows(session, job_id: str) -> list[DecisionRecordRow]:
    stmt = select(DecisionRecordRow).where(DecisionRecordRow.job_id == job_id)
    return list(session.scalars(stmt.order_by(DecisionRecordRow.id)))


def test_decisions_are_saved_and_match_log(session, r, caplog):
    caplog.set_level(logging.INFO, logger="app.planner")
    session.execute(
        DecisionRecordRow.__table__.delete().where(DecisionRecordRow.job_id == "job-trace")
    )
    session.commit()
    run(session, r, request(session), UnsureJev(), SecondPickLlm())
    [line] = [
        m.getMessage() for m in caplog.records if m.getMessage().startswith("decision_trace ")
    ]
    logged = json.loads(line.removeprefix("decision_trace "))["decisions"]
    saved = rows(session, "job-trace")
    assert len(saved) == len(logged) > 0
    for row, record in zip(saved, logged, strict=True):
        got = {name: getattr(row, name) for name in record}
        assert got == record
        assert row.created_at is not None


def test_disabled_writes_nothing(session, r):
    before = session.scalar(select(DecisionRecordRow.id).order_by(DecisionRecordRow.id.desc()))
    run(session, r, request(session), UnsureJev(), SecondPickLlm(), decision_trace_db=False)
    after = session.scalar(select(DecisionRecordRow.id).order_by(DecisionRecordRow.id.desc()))
    assert after == before
