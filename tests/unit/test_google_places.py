"""Google Places API (New) 用戶端。格式照官方文件（2026-10-21 查證），金鑰到了再實測。"""

import json
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import pytest
import respx

from app.places import (
    DETAILS_URL,
    NEARBY_URL,
    GooglePlaces,
    PlacesError,
    hours_from_periods,
    price_range_from_level,
)

TZ = ZoneInfo("Asia/Taipei")


def t(day, hh, mm=0):
    # 2026-10-19 是星期一
    return datetime(2026, 10, day, hh, mm, tzinfo=TZ)


def test_periods_to_opening_hours():
    # Google 的 day：0 是星期日
    periods = [
        {"open": {"day": d, "hour": 11, "minute": 30}, "close": {"day": d, "hour": 21, "minute": 0}}
        for d in range(1, 6)  # 星期一到五
    ] + [
        # 星期六 18:00 開到星期日 02:00（跨夜）
        {"open": {"day": 6, "hour": 18, "minute": 0}, "close": {"day": 0, "hour": 2, "minute": 0}}
    ]
    oh = hours_from_periods(periods)
    assert oh.interval_containing(t(19, 12)) == (t(19, 11, 30), t(19, 21))  # 星期一
    assert oh.interval_containing(t(25, 1)) == (t(24, 18), t(25, 2))  # 星期日凌晨
    assert oh.interval_containing(t(25, 12)) is None  # 星期日白天沒開


def test_always_open():
    oh = hours_from_periods([{"open": {"day": 0, "hour": 0, "minute": 0}}])
    start, end = oh.interval_containing(t(22, 3))
    assert start <= t(22, 3) < end


def test_no_periods_is_unknown():
    assert hours_from_periods([]) is None
    assert hours_from_periods(None) is None


@pytest.mark.parametrize(
    ("level", "price"),
    [
        ("PRICE_LEVEL_INEXPENSIVE", "under_200"),
        ("PRICE_LEVEL_MODERATE", "200_500"),
        ("PRICE_LEVEL_EXPENSIVE", "500_1000"),
        ("PRICE_LEVEL_VERY_EXPENSIVE", "over_1000"),
        ("PRICE_LEVEL_FREE", "under_200"),
        ("PRICE_LEVEL_UNSPECIFIED", None),
        (None, None),
    ],
)
def test_price_level(level, price):
    assert price_range_from_level(level) == price


def places():
    return GooglePlaces("key-test")


@respx.mock
def test_details_requests_enterprise_fields_in_traditional_chinese():
    route = respx.get(f"{DETAILS_URL}/ChIJabc").mock(
        return_value=httpx.Response(
            200,
            json={
                "displayName": {"text": "示意 Google 餐廳", "languageCode": "zh-TW"},
                "formattedAddress": "桃園市中壢區某路 1 號",
                "priceLevel": "PRICE_LEVEL_MODERATE",
                "regularOpeningHours": {
                    "periods": [{"open": {"day": d, "hour": 11, "minute": 0},
                                 "close": {"day": d, "hour": 22, "minute": 0}} for d in range(7)]
                },
            },
        )
    )  # fmt: skip
    d = places().details("ChIJabc")
    req = route.calls[0].request
    assert req.headers["X-Goog-Api-Key"] == "key-test"
    mask = req.headers["X-Goog-FieldMask"]
    assert " " not in mask
    assert set(mask.split(",")) == {"displayName", "formattedAddress", "regularOpeningHours",
                                    "priceLevel"}  # fmt: skip
    assert req.url.params["languageCode"] == "zh-TW"
    assert (d.name, d.address, d.price_range) == (
        "示意 Google 餐廳",
        "桃園市中壢區某路 1 號",
        "200_500",
    )
    assert d.hours.interval_containing(t(22, 12)) == (t(22, 11), t(22, 22))


@respx.mock
def test_basic_requests_pro_fields_only():
    route = respx.get(f"{DETAILS_URL}/ChIJabc").mock(
        return_value=httpx.Response(200, json={"displayName": {"text": "店"}})
    )
    d = places().basic("ChIJabc")
    assert set(route.calls[0].request.headers["X-Goog-FieldMask"].split(",")) == {
        "displayName", "formattedAddress"
    }  # fmt: skip
    assert d.name == "店" and d.hours is None


@respx.mock
def test_nearby_search():
    route = respx.post(NEARBY_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "places": [
                    {"id": "ChIJ1", "displayName": {"text": "壽司店"},
                     "primaryType": "sushi_restaurant",
                     "types": ["sushi_restaurant", "restaurant"],
                     "location": {"latitude": 24.95, "longitude": 121.22},
                     "priceLevel": "PRICE_LEVEL_INEXPENSIVE", "businessStatus": "OPERATIONAL"},
                    {"id": "ChIJ2", "displayName": {"text": "倒了"},
                     "location": {"latitude": 24.951, "longitude": 121.221},
                     "businessStatus": "CLOSED_PERMANENTLY"},
                ]
            },
        )
    )  # fmt: skip
    found = places().nearby(24.95, 121.22, 700)
    body = json.loads(route.calls[0].request.content)
    assert body["locationRestriction"]["circle"] == {
        "center": {"latitude": 24.95, "longitude": 121.22}, "radius": 700.0
    }  # fmt: skip
    assert body["maxResultCount"] == 20
    assert "restaurant" in body["includedTypes"]
    mask = route.calls[0].request.headers["X-Goog-FieldMask"]
    assert all(f.startswith("places.") for f in mask.split(","))
    # 停業的不收
    assert [p.place_id for p in found] == ["ChIJ1"]
    assert found[0].price_range == "under_200"
    assert found[0].primary_type == "sushi_restaurant"


@respx.mock
def test_errors():
    respx.get(f"{DETAILS_URL}/bad").mock(return_value=httpx.Response(403, json={"error": {}}))
    with pytest.raises(PlacesError, match="403"):
        places().details("bad")


def test_missing_key():
    with pytest.raises(PlacesError, match="GOOGLE_PLACES_API_KEY"):
        GooglePlaces("")
