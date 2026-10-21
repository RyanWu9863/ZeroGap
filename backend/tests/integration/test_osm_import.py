"""OSM 餐廳匯入：假的 Overpass（中壢站的實際回應）＋假的 Ollama，寫進測試資料庫。"""

import json
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import text

from app.collectors.osm_import import refresh_osm
from tests.integration.conftest import reseed

FIXTURE = Path(__file__).parent.parent / "fixtures" / "osm" / "zhongli.json"


class FakeJudge:
    model = "fake-llm"

    def __init__(self, answer=None):
        self.calls = []
        self.answer = answer

    def judge(self, name, tags, fields):
        self.calls.append((name, tuple(fields)))
        if self.answer is not None:
            return {f: v for f, v in self.answer.items() if f in fields}
        defaults = {"category_code": "other", "price_range": "200_500",
                    "meal_duration": "normal", "date_suitability": 1}  # fmt: skip
        return {f: defaults[f] for f in fields}


def fetcher(query):
    assert "around:1500" in query
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def clean(engine):
    reseed(engine, date(2026, 10, 22))
    yield
    with engine.begin() as c:
        c.execute(text("DELETE FROM jev_judgments"))
        c.execute(text("DELETE FROM restaurants WHERE source = 'osm'"))
    reseed(engine, date(2026, 10, 22))


def test_import_judges_and_replaces_demo(session):
    judge = FakeJudge()
    stats = refresh_osm(session, judge, fetcher=fetcher)

    assert stats["fetched"] == 108
    assert stats["drink_shops"] >= 9
    assert stats["upserted"] == stats["fetched"] - stats["drink_shops"] - stats["out_of_area"]
    rows = session.execute(
        text(
            "SELECT r.osm_name, r.category_code, r.price_range, r.meal_duration, "
            "r.date_suitability, a.code FROM restaurants r JOIN areas a ON a.id = r.area_id "
            "WHERE r.source = 'osm' AND r.is_active"
        )
    ).all()
    assert len(rows) == stats["upserted"]
    assert {r.code for r in rows} == {"zhongli"}  # 中壢站周圍，都歸到中壢
    assert all(r.category_code and r.price_range and r.meal_duration for r in rows)
    # 示意餐廳換掉了
    demo_active = session.scalar(
        text("SELECT count(*) FROM restaurants WHERE source = 'demo' AND is_active")
    )
    assert demo_active == 0
    # 有標籤的照標籤判斷，其他交給 LLM
    by = dict(
        session.execute(
            text("SELECT decided_by, count(*) FROM jev_judgments GROUP BY decided_by")
        ).all()
    )
    assert by["rule"] > 0 and by["llm"] > 0
    burger = session.execute(
        text(
            "SELECT category_code, meal_duration FROM restaurants "
            "WHERE source = 'osm' AND osm_tags->>'amenity' = 'fast_food' "
            "AND osm_tags->>'cuisine' = 'burger' LIMIT 1"
        )
    ).one()
    assert tuple(burger) == ("american", "fast")


def test_second_run_does_not_ask_again(session):
    refresh_osm(session, FakeJudge(), fetcher=fetcher)
    judge = FakeJudge()
    stats = refresh_osm(session, judge, fetcher=fetcher)
    assert judge.calls == []
    assert stats["judged"] == 0


def test_failed_judgement_leaves_fields_empty(session):
    stats = refresh_osm(session, FakeJudge(answer={}), fetcher=fetcher)
    unjudged = session.scalar(
        text("SELECT count(*) FROM restaurants WHERE source = 'osm' AND price_range IS NULL")
    )
    # 速食店照標籤就有價位；其他判斷失敗的留空，不會排進規劃
    assert unjudged > 0
    # 連續失敗 5 次就先停（多半是連不上），剩下的下次再補
    assert stats["judge_aborted"] is True
    assert stats["judge_failed"] == 5


def test_missing_places_are_deactivated(session):
    refresh_osm(session, FakeJudge(), fetcher=fetcher)
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    removed = next(e for e in data["elements"] if e.get("tags", {}).get("amenity") == "restaurant")
    data["elements"].remove(removed)
    stats = refresh_osm(session, FakeJudge(), fetcher=lambda q: data)
    assert stats["deactivated"] == 1
    active = session.scalar(
        text("SELECT is_active FROM restaurants WHERE external_id = :e"),
        {"e": f"{removed['type']}/{removed['id']}"},
    )
    assert active is False


def test_time_budget_stops_judging_and_resumes_next_run(session):
    from app.collectors.osm_import import judge_pending

    refresh_osm(session, FakeJudge(answer={}), fetcher=fetcher)  # 先失敗，全部留空
    ticks = iter(range(10_000))
    stats = judge_pending(session, FakeJudge(), budget_seconds=3, clock=lambda: next(ticks))
    assert stats["judged"] == 3
    assert stats["judge_remaining"] > 0
    again = judge_pending(session, FakeJudge())
    assert again["judge_remaining"] == 0
