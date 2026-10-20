"""代表點的座標：車站用 TDX 車站座標，其他查地標，名稱對不上的要人工確認。"""

from datetime import date

import pytest
from sqlalchemy import text

from app.collectors.tdx_geocode import GeoHit, geocode_hubs
from tests.integration.conftest import reseed


class FakeGeocoder:
    def __init__(self):
        self.asked = []

    def markname(self, name, city=None):
        self.asked.append(name)
        if name == "台茂購物中心":
            return [GeoHit("台茂購物中心", "桃園市蘆竹區南崁路一段112號", 25.0534, 121.2884)]
        return [GeoHit(f"某某{name}門市", "桃園市八德區某路1號", 24.96, 121.30)]


@pytest.fixture(autouse=True)
def seeded(engine):
    reseed(engine, date(2026, 10, 22))
    yield
    reseed(engine, date(2026, 10, 22))


def coords(session, hub):
    return session.execute(
        text("SELECT ST_Y(geom::geometry), ST_X(geom::geometry) FROM area_hubs WHERE name = :n"),
        {"n": hub},
    ).one()


def test_station_hubs_use_station_coordinates(session):
    geocoder = FakeGeocoder()
    stats = geocode_hubs(session, geocoder, only_missing=False)
    # 示意資料的台鐵中壢站在 24.9537, 121.2257
    assert coords(session, "中壢站") == pytest.approx((24.9537, 121.2257))
    assert "中壢站" not in geocoder.asked and "桃園站" not in geocoder.asked
    assert coords(session, "台茂購物中心") == pytest.approx((25.0534, 121.2884))
    assert {x["hub"] for x in stats["needs_review"]} == {"大湳", "廣豐新天地"}
