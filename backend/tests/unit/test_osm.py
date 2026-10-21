"""OSM（Overpass）餐廳的解析、商圈歸屬、照標籤判斷屬性。測試資料是中壢站 800 公尺內的實際回應。"""

import json
from pathlib import Path

from app.collectors.osm import (
    Hub,
    assign_areas,
    build_query,
    cuisine_from_tags,
    is_drink_shop,
    parse_elements,
    rule_attributes,
)

FIXTURE = Path(__file__).parent.parent / "fixtures" / "osm" / "zhongli.json"


def places():
    return parse_elements(json.loads(FIXTURE.read_text(encoding="utf-8")))


def test_query_covers_every_hub():
    q = build_query(
        [Hub(1, 2, "中壢站", 24.9537, 121.2259), Hub(2, 5, "台茂", 25.05, 121.29)], 1500
    )
    assert q.startswith("[out:json][timeout:")
    assert "(around:1500,24.9537,121.2259)" in q and "(around:1500,25.05,121.29)" in q
    assert "out center tags;" in q
    assert 'amenity"~"^(restaurant|fast_food|cafe)$"' in q


def test_parse_skips_unnamed_and_uses_way_center():
    ps = places()
    assert len(ps) == 108  # 109 筆裡有 1 筆沒有店名
    assert all(p.name for p in ps)
    assert all(p.external_id.startswith(("node/", "way/", "relation/")) for p in ps)
    way = [p for p in ps if p.external_id.startswith("way/")]
    assert way and way[0].lat and way[0].lng


def test_cuisine_mapping():
    assert cuisine_from_tags("japanese") == "japanese"
    assert cuisine_from_tags("diner;japanese") == "american"  # 取第一個對得上的
    assert cuisine_from_tags("火鍋") == "chinese"
    assert cuisine_from_tags("dumplings") == "chinese"
    assert cuisine_from_tags("steak_house") == "american"
    assert cuisine_from_tags("italian") == "western"
    assert cuisine_from_tags("korean") == "korean"
    assert cuisine_from_tags("thai") == "other"
    assert cuisine_from_tags("新加坡;malaysian") == "other"
    assert cuisine_from_tags(None) is None
    assert cuisine_from_tags("coffee_shop") is None  # 飲料不是一餐


def test_drink_shops_are_excluded():
    assert is_drink_shop({"amenity": "cafe", "cuisine": "coffee_shop"})
    assert is_drink_shop({"amenity": "fast_food", "cuisine": "bubble_tea;tea"})
    assert is_drink_shop({"amenity": "fast_food", "cuisine": "麵包;蛋糕"})
    assert not is_drink_shop({"amenity": "cafe", "cuisine": "coffee_shop;burger;italian"})
    assert not is_drink_shop({"amenity": "cafe"})  # 沒寫料理的咖啡店交給 LLM
    drinks = [p for p in places() if is_drink_shop(p.tags)]
    assert len(drinks) >= 9


def test_rule_attributes():
    assert rule_attributes({"amenity": "fast_food", "cuisine": "burger"}) == {
        "category_code": "american",
        "meal_duration": "fast",
        "price_range": "under_200",
    }
    assert rule_attributes({"amenity": "restaurant", "cuisine": "sushi"}) == {
        "category_code": "japanese"
    }
    assert rule_attributes({"amenity": "restaurant"}) == {}


def test_assign_areas_nearest_hub_within_radius():
    hubs = [
        Hub(id=1, area_id=10, name="中壢站", lat=24.95374, lng=121.22589),
        Hub(id=2, area_id=20, name="遠方", lat=25.2, lng=121.6),
    ]
    assigned = assign_areas(places(), hubs, radius_m=1500)
    assert assigned and all(area == 10 for _, area in assigned)
    assert len(assign_areas(places(), hubs, radius_m=10)) < len(assigned)
