"""示意種子資料與資料庫約束（規格書 8.4）。"""

from datetime import date, timedelta

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.models import Restaurant, Showtime
from app.seed.demo import EMPTY_DAY, TZ, seed
from tests.integration.conftest import reseed

TODAY = date(2026, 10, 22)


@pytest.fixture(scope="module")
def seeded(engine):
    return reseed(engine, TODAY)


def test_seed_twice_gives_same_counts(engine, seeded):
    from sqlalchemy.orm import sessionmaker

    with sessionmaker(engine)() as s:
        again = seed(s, today=TODAY)
    assert again == seeded
    assert seeded["showtimes"] > 0
    assert seeded["restaurants"] == 60
    assert seeded["cinemas"] == 6


def test_empty_day_has_no_showtimes(session, seeded):
    days = session.scalars(
        select(func.distinct(func.date(func.timezone("Asia/Taipei", Showtime.starts_at))))
    ).all()
    assert TODAY + timedelta(days=EMPTY_DAY) not in days
    assert len(days) == 6


def test_hubs_have_coordinates(session, seeded):
    missing = session.scalar(text("SELECT count(*) FROM area_hubs WHERE geom IS NULL"))
    assert missing == 0


def test_expired_showtimes_are_deleted(engine, seeded):
    from sqlalchemy.orm import sessionmaker

    with sessionmaker(engine)() as s:
        seed(s, today=TODAY + timedelta(days=1))
        earliest = s.scalar(select(func.min(Showtime.starts_at)))
        assert earliest.astimezone(TZ).date() == TODAY + timedelta(days=1)
        # 還原，讓其他測試用同一份資料
        s.execute(text("DELETE FROM showtimes"))
        s.commit()
        seed(s, today=TODAY)


def test_google_restaurant_cannot_store_content(session):
    session.add(
        Restaurant(source="google", external_id="ChIJtest", osm_name="不能存的店名", is_active=True)
    )
    with pytest.raises(IntegrityError, match="restaurants_google_no_content"):
        session.commit()
    session.rollback()


def test_google_restaurant_with_place_id_only_is_ok(session):
    session.add(Restaurant(source="google", external_id="ChIJok", is_active=True))
    session.commit()
    session.execute(text("DELETE FROM restaurants WHERE external_id = 'ChIJok'"))
    session.commit()


def test_unknown_source_is_rejected(session):
    session.add(Restaurant(source="yelp", external_id="x", is_active=True))
    with pytest.raises(IntegrityError, match="restaurants_source"):
        session.commit()
    session.rollback()


def test_demo_rows_stay_inactive_once_real_data_exists(engine, session, seeded):
    from sqlalchemy.orm import sessionmaker

    session.execute(
        text(
            "INSERT INTO stations (station_uid, operator, name, county_id, geom, is_active) "
            "SELECT 'TRA-9999', 'TRA', '真的站', id, 'SRID=4326;POINT(121.3 25.0)', true "
            "FROM counties WHERE code = 'Taoyuan'"
        )
    )
    session.execute(
        text(
            "INSERT INTO restaurants (source, external_id, osm_name, is_active) "
            "VALUES ('osm', 'node/1', '真的店', true)"
        )
    )
    session.commit()
    try:
        with sessionmaker(engine)() as s:
            seed(s, today=TODAY)
        demo_active = session.scalar(
            text(
                "SELECT (SELECT count(*) FROM stations WHERE station_uid LIKE 'demo-%' "
                "AND is_active) + (SELECT count(*) FROM restaurants WHERE source = 'demo' "
                "AND is_active)"
            )
        )
        assert demo_active == 0
    finally:
        session.execute(text("DELETE FROM stations WHERE station_uid = 'TRA-9999'"))
        session.execute(text("DELETE FROM restaurants WHERE external_id = 'node/1'"))
        session.commit()
        reseed(engine, TODAY)
