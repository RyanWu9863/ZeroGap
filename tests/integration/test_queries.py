"""PostGIS 查詢（規格書 4.4），用示意種子資料驗證。"""

from datetime import date

import pytest
from sqlalchemy import text

from app.planning.rules import max_straight_meters, walk_minutes
from app.queries import cinema_restaurant_meters, nearest_hubs, restaurants_within_walk
from app.transit import haversine_m
from tests.integration.conftest import reseed


@pytest.fixture(scope="module", autouse=True)
def seeded(engine):
    reseed(engine, date(2026, 10, 22))


def _ids(session):
    area = session.scalar(text("SELECT id FROM areas WHERE code = 'bade'"))
    cinema = session.scalar(text("SELECT id FROM cinemas WHERE atmovies_id = 'demo-bade-a'"))
    return area, cinema


def _coords(session, table, id_):
    return session.execute(
        text(f"SELECT ST_Y(geom::geometry), ST_X(geom::geometry) FROM {table} WHERE id = :i"),
        {"i": id_},
    ).one()


def test_within_walk_matches_walk_minutes(session):
    area, cinema = _ids(session)
    for limit in (5, 12, 20):
        rows = restaurants_within_walk(session, cinema, area, limit)
        assert rows, limit
        assert all(walk_minutes(m) <= limit for _, m in rows)
        assert all(m <= max_straight_meters(limit) for _, m in rows)
    assert len(restaurants_within_walk(session, cinema, area, 5)) < len(
        restaurants_within_walk(session, cinema, area, 20)
    )


def test_within_walk_distance_is_close_to_haversine(session):
    area, cinema = _ids(session)
    clat, clng = _coords(session, "cinemas", cinema)
    for rid, meters in restaurants_within_walk(session, cinema, area, 20)[:5]:
        rlat, rlng = _coords(session, "restaurants", rid)
        assert meters == pytest.approx(haversine_m(clat, clng, rlat, rlng), rel=0.01)


def test_nearest_hub_for_each_restaurant(session):
    area, _ = _ids(session)
    hubs = {
        hid: (lat, lng)
        for hid, lat, lng in session.execute(
            text(
                "SELECT id, ST_Y(geom::geometry), ST_X(geom::geometry) FROM area_hubs "
                "WHERE area_id = :a"
            ),
            {"a": area},
        )
    }
    assert len(hubs) == 2  # 八德：大湳、廣豐新天地
    result = nearest_hubs(session, area)
    assert len(result) == 15
    used = set()
    for rid, (hub_id, meters) in result.items():
        rlat, rlng = _coords(session, "restaurants", rid)
        dist = {h: haversine_m(rlat, rlng, *c) for h, c in hubs.items()}
        assert hub_id == min(dist, key=dist.get)
        assert meters == pytest.approx(dist[hub_id], rel=0.01)
        used.add(hub_id)
    assert used == set(hubs)  # 兩個代表點都有店對應


def test_cinema_restaurant_meters_covers_all_pairs(session):
    area = session.scalar(text("SELECT id FROM areas WHERE code = 'zhongli'"))
    pairs = cinema_restaurant_meters(session, area)
    assert len(pairs) == 2 * 15  # 中壢 2 家影城 × 15 家餐廳
    assert all(m > 0 for m in pairs.values())
