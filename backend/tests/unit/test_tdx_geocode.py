"""TDX 地理編碼的解析（2026-10-20 實測：Geometry 是 WKT，經度在前）。"""

from app.collectors.tdx_geocode import parse_hits, parse_point

TAIMALL = {
    "Geometry": "POINT (121.28839369011678 25.053372749452876)",
    "Address": "桃園市蘆竹區南崁路一段112號",
    "Name": "台茂購物中心",
}


def test_parse_point_is_lon_lat():
    assert parse_point(TAIMALL["Geometry"]) == (25.053372749452876, 121.28839369011678)
    assert parse_point("POINT(121.5 25.0)") == (25.0, 121.5)
    assert parse_point("") is None
    assert parse_point("LINESTRING (1 2, 3 4)") is None


def test_hits_filtered_by_city():
    other = {**TAIMALL, "Address": "臺北市中正區某路1號"}
    hits = parse_hits([other, TAIMALL], city="桃園市")
    assert [h.name for h in hits] == ["台茂購物中心"]
    assert parse_hits([other], city="桃園市") == []
    assert len(parse_hits([other, TAIMALL])) == 2
