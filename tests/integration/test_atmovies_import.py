"""開眼電影網匯入：假的網站（2026-10-20 實際抓的頁面）、假的地理編碼和片型判斷。"""

from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text

from app.collectors.atmovies_import import refresh_atmovies
from app.collectors.tdx_geocode import GeoHit
from tests.integration.conftest import reseed

TZ = ZoneInfo("Asia/Taipei")
FIXTURES = Path(__file__).parent.parent / "fixtures" / "atmovies"
NOW = datetime(2026, 10, 20, 9, 0, tzinfo=TZ)  # 測試資料是 10/20 早上抓的


def page(name):
    return (FIXTURES / name).read_text(encoding="utf-8")


class FakeSite:
    def __init__(self):
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        if url.endswith("/showtime/a03/"):
            return page("theaters_a03.html")
        if "/showtime/t03308/a03/20261021/" in url:
            # 隔天的頁面：日期換成 10/21
            return page("theater_t03308.html").replace("2026/10/20 (二)", "2026/10/21 (三)")
        if "/showtime/t03308/" in url:
            return page("theater_t03308.html")
        if "/showtime/t" in url:
            # 其他影城：沒有場次的空頁面
            return "<h2>其他影城</h2><ul><li>地址: 桃園市</li></ul><h3>2026/10/20 (二)</h3>"
        if "/movie/" in url:
            return page("movie.html")
        raise AssertionError(url)


class FakeGeocoder:
    def address(self, address, city=None):
        return [GeoHit("x", address, 24.99, 121.31)]


class FakeGenre:
    model = "fake-llm"

    def __init__(self):
        self.asked = []

    def genre(self, title, synopsis, country):
        self.asked.append(title)
        return "action"


@pytest.fixture(autouse=True)
def clean(engine):
    reseed(engine, date(2026, 10, 22))
    yield
    with engine.begin() as c:
        c.execute(text("DELETE FROM showtimes"))
        c.execute(text("DELETE FROM jev_judgments"))
        c.execute(text("DELETE FROM movies WHERE atmovies_id NOT LIKE 'demo-%'"))
        c.execute(text("DELETE FROM cinemas WHERE atmovies_id NOT LIKE 'demo-%'"))
    reseed(engine, date(2026, 10, 22))


def run(session, site=None, genre=None):
    return refresh_atmovies(
        session, site or FakeSite(), FakeGeocoder(), genre or FakeGenre(),
        sleep=lambda s: None, now=NOW,
    )  # fmt: skip


def test_import(session):
    site = FakeSite()
    stats = run(session, site)

    cinemas = session.execute(
        text(
            "SELECT c.atmovies_id, c.name, c.chain, a.code, c.geom IS NOT NULL AS has_geom "
            "FROM cinemas c JOIN areas a ON a.id = c.area_id "
            "WHERE c.is_active AND c.atmovies_id NOT LIKE 'demo-%'"
        )
    ).all()
    by_id = {c.atmovies_id: c for c in cinemas}
    assert len(cinemas) == 8  # 10 家去掉兩家光影館
    assert by_id["t03308"].chain == "vieshow" and by_id["t03308"].code == "taoyuan"
    assert by_id["t03301"].code == "luzhu"
    assert all(c.has_geom for c in cinemas)
    # 真的影城進來後，示意影城停用
    assert (
        session.scalar(
            text("SELECT count(*) FROM cinemas WHERE atmovies_id LIKE 'demo-%' AND is_active")
        )
        == 0
    )

    shows = session.execute(
        text(
            "SELECT m.title, s.starts_at, s.ends_at, s.hall_type, s.language, s.version_raw "
            "FROM showtimes s JOIN movies m ON m.id = s.movie_id "
            "JOIN cinemas c ON c.id = s.cinema_id WHERE c.atmovies_id = 't03308'"
        )
    ).all()
    assert stats["showtimes"] == len(shows) > 50
    first = next(
        s for s in shows if s.title == "快打旋風" and s.starts_at.astimezone(TZ).hour == 12
    )
    assert (first.ends_at - first.starts_at).total_seconds() == 119 * 60
    chiikawa = {s.language for s in shows if s.title == "劇場版 吉伊卡哇 人魚島的秘密"}
    assert chiikawa == {"中文", "日語"}
    # 片名用場次頁上的中文片名，不會被電影介紹頁蓋掉
    titles = set(
        session.scalars(text("SELECT title FROM movies WHERE atmovies_id NOT LIKE 'demo-%'"))
    )
    assert "逃出鯨吞" in titles and "快打旋風" in titles
    assert (
        session.scalar(
            text(
                "SELECT count(*) FROM movies "
                "WHERE atmovies_id NOT LIKE 'demo-%' AND genre_code IS NULL"
            )
        )
        == 0
    )
    assert stats["movies_fetched"] == len(titles)
    # 每頁之間都有間隔（測試裡用假的 sleep）；只抓這家影城有的日期
    assert any(u.endswith("/t03308/a03/20261021/") for u in site.urls)


def test_second_run_does_not_refetch_known_movies(session):
    run(session)
    site, genre = FakeSite(), FakeGenre()
    stats = run(session, site, genre)
    assert stats["movies_fetched"] == 0
    assert not [u for u in site.urls if "/movie/" in u]
    assert genre.asked == []


def test_dropped_showtime_is_removed(session):
    run(session)
    before = session.scalar(text("SELECT count(*) FROM showtimes"))

    class FewerShows(FakeSite):
        def __call__(self, url):
            html = super().__call__(url)
            return html.replace("<li>22：20</li>", "") if "/t03308/" in url else html

    stats = run(session, FewerShows())
    after = session.scalar(text("SELECT count(*) FROM showtimes"))
    assert after < before
    assert stats["showtimes_removed"] == before - after
