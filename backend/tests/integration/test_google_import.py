"""Google Places 餐廳匯入：假的 Google（照官方文件的格式）、假的 LLM 判斷。"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import redis
from sqlalchemy import text

from app.collectors.google_import import (
    centers_around,
    refresh_google_geom,
    refresh_google_places,
    rule_attributes_google,
)
from app.places import NearbyPlace, PlacesError
from app.redis_utils.quota import add_usage, used
from tests.integration.conftest import reseed

TZ = ZoneInfo("Asia/Taipei")


class FakeJudge:
    model = "fake-llm"

    def __init__(self):
        self.calls = []

    def judge(self, name, tags, fields):
        self.calls.append((name, tuple(fields)))
        defaults = {"category_code": "other", "price_range": "200_500",
                    "meal_duration": "normal", "date_suitability": 1}  # fmt: skip
        return {f: defaults[f] for f in fields}


class FakeGoogle:
    def __init__(self, near=None):
        self.calls = 0
        self.near = near

    def nearby(self, lat, lng, radius_m):
        self.calls += 1
        # 中壢站（示意 24.9537, 121.2257）附近才有店
        if abs(lat - 24.9537) > 0.02 or abs(lng - 121.2257) > 0.02:
            return []
        return self.near or [
            NearbyPlace("ChIJsushi", "壽司店", 24.9540, 121.2260, "sushi_restaurant",
                        ("sushi_restaurant", "restaurant"), "under_200"),
            NearbyPlace("ChIJsteak", "牛排館", 24.9550, 121.2270, "steak_house",
                        ("steak_house", "restaurant"), None),
        ]  # fmt: skip

    def location(self, place_id):
        return None if place_id == "ChIJgone" else (24.9541, 121.2261)


@pytest.fixture
def r(redis_url):
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    client.flushdb()
    yield client
    client.flushdb()


@pytest.fixture(autouse=True)
def clean(engine):
    reseed(engine, date(2026, 10, 22))
    yield
    with engine.begin() as c:
        c.execute(text("DELETE FROM jev_judgments"))
        c.execute(text("DELETE FROM restaurants WHERE source = 'google'"))
    reseed(engine, date(2026, 10, 22))


def test_centers_around_cover_the_area():
    centers = centers_around(24.95, 121.22)
    assert len(centers) == 7
    assert centers[0] == (24.95, 121.22)


def test_rule_attributes_from_google_types():
    assert rule_attributes_google("sushi_restaurant", ("sushi_restaurant",), "under_200") == {
        "category_code": "japanese",
        "price_range": "under_200",
    }
    assert rule_attributes_google("fast_food_restaurant", (), None) == {
        "meal_duration": "fast",
        "price_range": "under_200",
    }
    assert rule_attributes_google("restaurant", ("restaurant",), None) == {}


def test_import_stores_only_place_id_and_judges(session, r):
    judge, google = FakeJudge(), FakeGoogle()
    stats = refresh_google_places(session, r, google, judge, quota_limit=950)
    assert stats["upserted"] == 2
    assert google.calls == stats["searches"] == used(r, "google:nearby_enterprise")
    rows = session.execute(
        text(
            "SELECT external_id, osm_name, category_code, price_range, a.code "
            "FROM restaurants r JOIN areas a ON a.id = r.area_id WHERE source = 'google' "
            "ORDER BY external_id"
        )
    ).all()
    # 店名不存（條款）；屬性：壽司照類型、牛排館照類型判斷成美式，其他欄位交給 LLM
    assert [(x.external_id, x.osm_name, x.category_code, x.code) for x in rows] == [
        ("ChIJsteak", None, "american", "zhongli"),
        ("ChIJsushi", None, "japanese", "zhongli"),
    ]
    assert rows[1].price_range == "under_200"
    assert ("牛排館", ("price_range", "meal_duration", "date_suitability")) in judge.calls


def test_quota_used_up_stops_searching(session, r):
    add_usage(r, "google:nearby_enterprise", 950)
    google = FakeGoogle()
    stats = refresh_google_places(session, r, google, FakeJudge(), quota_limit=950)
    assert google.calls == 0
    assert stats["quota_exhausted"] is True


def test_coordinates_older_than_25_days_are_refreshed(session, r):
    old = datetime.now(TZ) - timedelta(days=26)
    session.execute(
        text(
            "INSERT INTO restaurants (source, external_id, geom, geom_fetched_at, is_active) "
            "VALUES "
            "('google', 'ChIJold', 'SRID=4326;POINT(121.2 24.9)', :t, true), "
            "('google', 'ChIJgone', 'SRID=4326;POINT(121.2 24.9)', :t, true), "
            "('google', 'ChIJnew', 'SRID=4326;POINT(121.2 24.9)', now(), true)"
        ),
        {"t": old},
    )
    session.commit()
    stats = refresh_google_geom(session, r, FakeGoogle(), quota_limit=9500)
    assert stats == {"refreshed": 1, "deactivated": 1, "retry_later": 0, "quota_exhausted": False}
    gone = session.execute(
        text("SELECT is_active, geom FROM restaurants WHERE external_id = 'ChIJgone'")
    ).one()
    assert gone.is_active is False and gone.geom is None  # 拿不到新座標就清掉（條款上限 30 天）


class FlakyGoogle(FakeGoogle):
    """ChIJ404 是 Google 回 404（place ID 過時）；其他都是暫時的錯誤（逾時、5xx、429）。"""

    def location(self, place_id):
        if place_id == "ChIJ404":
            raise PlacesError("Google Places HTTP 404：NOT_FOUND", status=404)
        raise PlacesError("Google Places HTTP 503：UNAVAILABLE", status=503)


def test_temporary_errors_keep_restaurant_until_30_days(session, r):
    # 暫時的錯誤明天再試；明天再試會超過 30 天（條款上限）的才停用；404 馬上停用（bug 清單 L1）
    now = datetime.now(TZ)
    session.execute(
        text(
            "INSERT INTO restaurants (source, external_id, geom, geom_fetched_at, is_active) "
            "VALUES "
            "('google', 'ChIJflaky', 'SRID=4326;POINT(121.2 24.9)', :young, true), "
            "('google', 'ChIJexpired', 'SRID=4326;POINT(121.2 24.9)', :old, true), "
            "('google', 'ChIJ404', 'SRID=4326;POINT(121.2 24.9)', :young, true)"
        ),
        {"young": now - timedelta(days=28, hours=23), "old": now - timedelta(days=29, minutes=1)},
    )
    session.commit()
    stats = refresh_google_geom(session, r, FlakyGoogle(), quota_limit=9500)
    assert stats == {"refreshed": 0, "deactivated": 2, "retry_later": 1, "quota_exhausted": False}
    rows = dict(
        session.execute(
            text(
                "SELECT external_id, is_active AND geom IS NOT NULL FROM restaurants "
                "WHERE external_id IN ('ChIJflaky', 'ChIJexpired', 'ChIJ404')"
            )
        ).all()
    )
    assert rows == {"ChIJflaky": True, "ChIJexpired": False, "ChIJ404": False}
