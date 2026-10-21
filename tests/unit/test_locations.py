"""自選出發位置的搜尋：查地址還是查地標（2026-10-21）。"""

from app.collectors.tdx_geocode import GeoHit
from app.locations import looks_like_address, normalize, search

HIT = GeoHit(name="中原大學", address="桃園市中壢區中北路200號", lat=24.9576, lng=121.2405)


def test_address_or_landmark():
    assert looks_like_address("中壢區中北路200號")
    assert looks_like_address("中山東路一段")
    assert not looks_like_address("中原大學")
    assert normalize("  中原   大學 ") == "中原 大學"


def test_only_one_kind_is_queried():
    calls = []

    def markname(q, city):
        calls.append(("markname", q))
        return [HIT, HIT]  # 重複的只留一個

    def address(q, city):
        calls.append(("address", q))
        return [HIT]

    assert search(markname, address, "中原大學") == [HIT]
    assert calls == [("markname", "中原大學")]
    calls.clear()
    assert search(markname, address, "中壢區中北路200號") == [HIT]
    assert calls == [("address", "桃園市中壢區中北路200號")]  # 地址補上桃園市


def test_landmark_not_found_does_not_fall_back_to_address():
    # 「台北101」補上桃園市去查地址，會回「桃園市桃園區」的區中心
    district = GeoHit(name=None, address="桃園市桃園區", lat=24.99, lng=121.29)
    assert search(lambda q, c: [], lambda q, c: [district], "台北101") == []
    assert search(lambda q, c: [district], lambda q, c: [], "台北101") == []  # 查地標也一樣
    named = GeoHit(name="桃園市桃園區", address="桃園市桃園區", lat=24.99, lng=121.29)
    assert search(lambda q, c: [named], lambda q, c: [], "台北101") == []
    # 地址查到的只到區也不收；有路名的用地址當名稱
    road = GeoHit(name=None, address="桃園市中壢區普忠里中北路200號", lat=24.9574, lng=121.2407)
    hits = search(lambda q, c: [], lambda q, c: [district, road], "中北路200號")
    assert [h.name for h in hits] == ["桃園市中壢區普忠里中北路200號"]
