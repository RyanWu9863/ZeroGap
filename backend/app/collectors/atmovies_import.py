"""開眼電影網 → `cinemas`、`movies`、`showtimes`（規格書 7.2 的 `refresh_daily`）。

1. 影城清單：光影館不收；商圈依地址的行政區；品牌依名稱；還沒有座標的用 TDX 地理編碼
2. 每家影城抓今天和頁面上列出的其他日期，每頁間隔幾秒
3. 沒看過的電影才抓介紹頁；片名用場次頁上的中文片名；片型交給 LLM（Jev 金鑰到之前）
4. 場次 UPSERT；抓到的那幾天裡已經不再列出的場次刪掉；過期的場次刪掉（4.5）
5. 真的影城進來後，示意影城設成停用
"""

import logging
from collections.abc import Callable
from datetime import datetime, time, timedelta
from typing import Any, Protocol
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.collectors.atmovies import (
    BASE,
    REGION,
    SKIP_THEATERS,
    USER_AGENT,
    area_from_address,
    chain_from_name,
    movie_url,
    parse_movie,
    parse_theater_list,
    parse_theater_page,
    parse_version,
    showtimes_of,
    theater_url,
)
from app.models import Area, Cinema, JevJudgment, Movie, Showtime

log = logging.getLogger(__name__)
TZ = ZoneInfo("Asia/Taipei")
PAGE_DELAY_SECONDS = 3.0
# 電影介紹頁的語言欄位是英文 → 場次的語言
LANGUAGE_NAMES = {
    "english": "英語", "japanese": "日語", "mandarin": "中文", "chinese": "中文",
    "taiwanese": "台語", "korean": "韓語", "cantonese": "粵語", "french": "法語",
    "spanish": "西班牙語", "german": "德語", "thai": "泰語", "hindi": "印度語",
}  # fmt: skip


class GenreJudge(Protocol):
    model: str

    def genre(self, title: str, synopsis: str | None, country: str | None) -> str | None: ...


class AddressGeocoder(Protocol):
    def address(self, address: str, city: str | None = None) -> list: ...


def make_fetcher(timeout: float = 30.0) -> Callable[[str], str]:
    client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=timeout,
                          follow_redirects=True)  # fmt: skip

    def fetch(url: str) -> str:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.text

    return fetch


def _language(version_language: str | None, movie_language: str | None) -> str | None:
    if version_language:
        return version_language
    if not movie_language:
        return None
    first = movie_language.split(",")[0].split("(")[0].strip()
    return LANGUAGE_NAMES.get(first.lower(), first)


def refresh_atmovies(
    session: Session,
    fetch: Callable[[str], str],
    geocoder: AddressGeocoder,
    judge: GenreJudge,
    sleep: Callable[[float], None],
    now: datetime | None = None,
    keep_alive: Callable[[], None] = lambda: None,
) -> dict[str, Any]:
    now = now or datetime.now(TZ)
    areas = dict(session.execute(select(Area.code, Area.id)).all())
    stats: dict[str, Any] = {"cinemas": 0, "geocoded": 0, "movies_fetched": 0, "showtimes": 0,
                             "showtimes_removed": 0, "skipped_theaters": []}  # fmt: skip

    def get(url: str) -> str:
        html = fetch(url)
        sleep(PAGE_DELAY_SECONDS)
        return html

    # ── 1. 影城 ──────────────────────────────────────────────
    theaters = []
    for t in parse_theater_list(get(f"{BASE}/showtime/{REGION}/")):
        area = area_from_address(t.address)
        if any(s in t.name for s in SKIP_THEATERS) or area is None:
            stats["skipped_theaters"].append(t.name)
            continue
        theaters.append((t, areas[area]))
    for t, area_id in theaters:
        stmt = insert(Cinema).values(
            atmovies_id=t.atmovies_id, name=t.name, address=t.address, area_id=area_id,
            chain=chain_from_name(t.name), is_active=True,
        )  # fmt: skip
        session.execute(
            stmt.on_conflict_do_update(
                index_elements=["atmovies_id"],
                set_={"name": stmt.excluded.name, "address": stmt.excluded.address,
                      "area_id": stmt.excluded.area_id, "chain": stmt.excluded.chain,
                      "is_active": True, "updated_at": text("now()")},
            )
        )  # fmt: skip
    session.commit()
    stats["cinemas"] = len(theaters)
    for cid, address in session.execute(
        text(
            "SELECT id, address FROM cinemas WHERE geom IS NULL AND is_active "
            "AND atmovies_id NOT LIKE 'demo-%'"
        )
    ).all():
        hits = geocoder.address(address.split("(")[0].strip(), "桃園市") if address else []
        if hits:
            session.execute(
                text(
                    "UPDATE cinemas SET geom = ST_GeogFromText(:w), geocoded_at = now() "
                    "WHERE id = :i"
                ),
                {"w": f"SRID=4326;POINT({hits[0].lng} {hits[0].lat})", "i": cid},
            )  # fmt: skip
            stats["geocoded"] += 1
    session.commit()
    cinema_ids = dict(session.execute(select(Cinema.atmovies_id, Cinema.id)).all())

    # ── 2. 場次頁 ────────────────────────────────────────────
    pages = []
    for t, _ in theaters:
        first = parse_theater_page(get(theater_url(t.atmovies_id)))
        pages.append((t.atmovies_id, first))
        for day in first.other_days:
            pages.append((t.atmovies_id, parse_theater_page(get(theater_url(t.atmovies_id, day)))))
        keep_alive()

    # ── 3. 電影 ──────────────────────────────────────────────
    films = {f.movie_id: f for _, p in pages for f in p.films}
    known = dict(session.execute(select(Movie.atmovies_id, Movie.id)).all())
    for movie_id, film in films.items():
        if movie_id in known:
            continue
        info = parse_movie(get(movie_url(movie_id)))
        stats["movies_fetched"] += 1
        runtime = info.runtime_min or film.runtime_min
        if runtime is None:
            log.info("「%s」沒有片長，不收", film.title)
            continue
        genre = judge.genre(film.title, info.synopsis, info.country)
        movie = Movie(
            atmovies_id=movie_id, title=film.title, runtime_min=runtime,
            rating=film.rating or info.rating, genre_code=genre, synopsis=info.synopsis,
            language_raw=info.language_raw, country=info.country,
        )  # fmt: skip
        session.add(movie)
        session.flush()
        known[movie_id] = movie.id
        if genre:
            session.add(
                JevJudgment(
                    subject_type="movie", subject_id=movie.id, question="genre", answer=genre,
                    probabilities={genre: 1.0}, confidence=None, decided_by="llm",
                    model_version=judge.model, jev_version="none", judged_at=now,
                )
            )  # fmt: skip
        session.commit()
        keep_alive()
    movies = {
        m.atmovies_id: m
        for m in session.scalars(select(Movie).where(Movie.atmovies_id.in_(list(films))))
    }

    # ── 4. 場次 ──────────────────────────────────────────────
    for atmovies_id, p in pages:
        cid = cinema_ids[atmovies_id]
        rows = []
        for f in p.films:
            movie = movies.get(f.movie_id)
            if movie is None:
                continue
            hall, version_language = parse_version(f.version_raw)
            for starts in showtimes_of(f, p.day):
                rows.append(
                    {"cinema_id": cid, "movie_id": movie.id, "starts_at": starts,
                     "ends_at": starts + timedelta(minutes=movie.runtime_min),
                     "version_raw": f.version_raw, "hall_type": hall,
                     "language": _language(version_language, movie.language_raw)}
                )  # fmt: skip
        rows = list({(r["movie_id"], r["starts_at"], r["version_raw"]): r for r in rows}.values())
        if rows:
            stmt = insert(Showtime).values(rows)
            session.execute(
                stmt.on_conflict_do_update(
                    index_elements=["cinema_id", "movie_id", "starts_at", "version_raw"],
                    set_={"ends_at": stmt.excluded.ends_at, "hall_type": stmt.excluded.hall_type,
                          "language": stmt.excluded.language, "updated_at": text("now()")},
                )
            )  # fmt: skip
        # 這一天（含隔天凌晨的場次）已經不再列出的場次刪掉
        start = datetime.combine(p.day, time(5, 0), TZ)
        keep = [(r["movie_id"], r["starts_at"], r["version_raw"]) for r in rows]
        existing = session.execute(
            text(
                "SELECT id, movie_id, starts_at, version_raw FROM showtimes "
                "WHERE cinema_id = :c AND starts_at >= :s AND starts_at < :e"
            ),
            {"c": cid, "s": start, "e": start + timedelta(days=1)},
        ).all()
        gone = [
            e.id
            for e in existing
            if (e.movie_id, e.starts_at.astimezone(TZ), e.version_raw) not in set(keep)
        ]
        if gone:
            session.execute(text("DELETE FROM showtimes WHERE id = ANY(:ids)"), {"ids": gone})
            stats["showtimes_removed"] += len(gone)
        stats["showtimes"] += len(rows)
        session.commit()

    # ── 5. 過期場次、示意影城 ────────────────────────────────
    session.execute(text("DELETE FROM showtimes WHERE starts_at < :now"), {"now": now})
    if theaters:
        session.execute(
            update(Cinema)
            .where(Cinema.atmovies_id.like("demo-%"), Cinema.is_active)
            .values(is_active=False)
        )
    session.commit()
    return stats
