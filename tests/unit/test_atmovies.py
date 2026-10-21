"""開眼電影網的解析。測試資料是 2026-10-20 實際抓的頁面（tests/fixtures/atmovies）。"""

from datetime import date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.collectors.atmovies import (
    area_from_address,
    chain_from_name,
    parse_movie,
    parse_theater_list,
    parse_theater_page,
    parse_version,
    showtimes_of,
)

TZ = ZoneInfo("Asia/Taipei")
FIXTURES = Path(__file__).parent.parent / "fixtures" / "atmovies"


def html(name):
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_theater_list():
    theaters = parse_theater_list(html("theaters_a03.html"))
    assert len(theaters) == 10
    taimall = theaters[0]
    assert taimall.atmovies_id == "t03301"
    assert taimall.name == "美麗新台茂影城"
    assert taimall.address.startswith("桃園市蘆竹")
    assert "t03308" in {t.atmovies_id for t in theaters}


@pytest.mark.parametrize(
    ("address", "area"),
    [
        ("桃園市桃園區中正路61號9樓 (統領百貨)", "taoyuan"),
        ("桃園市中壢區中園路二段501號5樓", "zhongli"),
        ("桃園市八德區介壽路一段728號3F", "bade"),
        ("桃園市蘆竹鄉南崁路一段112號7樓", "luzhu"),  # 開眼還寫舊的「鄉」
        ("桃園市蘆竹區南崁路一段112號", "luzhu"),
        ("桃園市大園區某路1號", None),
    ],
)
def test_area_from_address(address, area):
    assert area_from_address(address) == area


def test_skip_only_the_two_film_houses():
    from app.collectors.atmovies import SKIP_THEATERS

    names = [t.name for t in parse_theater_list(html("theaters_a03.html"))]
    skipped = [n for n in names if any(s in n for s in SKIP_THEATERS)]
    assert skipped == ["桃園光影文化館", "中壢光影電影館"]
    assert "桃園新光影城" not in skipped


def test_chain_from_name():
    assert chain_from_name("桃園統領威秀影城") == "vieshow"
    assert chain_from_name("桃園站前in89豪華影城") == "in89"
    assert chain_from_name("桃園新光影城") == "skcinemas"
    assert chain_from_name("國賓桃園八德") == "ambassador"
    assert chain_from_name("星橋國際影城") is None


def test_theater_page():
    page = parse_theater_page(html("theater_t03308.html"))
    assert page.name == "桃園統領威秀影城"
    assert page.address.startswith("桃園市桃園區中正路61號")
    assert page.day == date(2026, 10, 20)
    assert page.other_days == [date(2026, 10, 21)]
    first = page.films[0]
    assert (first.movie_id, first.title, first.runtime_min, first.rating) == (
        "fsen27419420", "快打旋風", 119, "保護級"
    )  # fmt: skip
    assert first.version_raw == ""
    assert first.times[0] == time(12, 0) and first.times[-1] == time(22, 20)
    # 同一部片不同版本是不同的區塊
    chiikawa = [f for f in page.films if f.movie_id == "fnjp39026173"]
    assert [f.version_raw for f in chiikawa] == ["國語版", "日語版"]
    # 時間重複列出的只留一個；沒有片長、沒有分級的允許是 None
    jinro = next(f for f in page.films if f.movie_id == "fJjp00193253")
    assert jinro.times == [time(13, 50), time(19, 50)]
    assert jinro.runtime_min is None and jinro.rating is None


def test_showtimes_after_midnight_are_next_day():
    from app.collectors.atmovies import FilmShowing

    film = FilmShowing("f1", "x", 100, None, "", [time(22, 30), time(23, 50), time(0, 40)])
    starts = showtimes_of(film, date(2026, 10, 20))
    assert starts == [
        datetime(2026, 10, 20, 22, 30, tzinfo=TZ),
        datetime(2026, 10, 20, 23, 50, tzinfo=TZ),
        datetime(2026, 10, 21, 0, 40, tzinfo=TZ),
    ]


@pytest.mark.parametrize(
    ("raw", "hall", "language"),
    [
        ("", "standard", None),
        ("國語版", "standard", "中文"),
        ("中文版", "standard", "中文"),
        ("日語版", "standard", "日語"),
        ("日文版", "standard", "日語"),
        ("英語版", "standard", "英語"),
        ("IMAX", "imax", None),
        ("IMAX版", "imax", None),
        ("4DX版", "4dx", None),
        ("ULTRA 4DX", "4dx", None),
        ("SCREENX", "screenx", None),
        ("Dolby Cinema", "dolby", None),
        ("杜比影院", "dolby", None),
        ("TITAN廳", "titan", None),
        ("ATMOS", "titan", None),
        ("Atmos版", "titan", None),
        ("皇家廳", "premium", None),
        ("MUCROWN廳", "premium", None),
        ("4K數位修復版", "standard", None),
        ("特別版", "standard", None),
        ("PRE", "standard", None),
    ],
)
def test_parse_version(raw, hall, language):
    assert parse_version(raw) == (hall, language)


def test_movie_page():
    m = parse_movie(html("movie.html"))
    assert m.title == "快打旋風"
    assert m.runtime_min == 119
    assert m.rating == "保護級"
    assert m.language_raw == "English"
    assert m.country == "United States"
    assert m.synopsis and "街機" in m.synopsis
