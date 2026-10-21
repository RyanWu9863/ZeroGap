"""資料更新的工作（規格書 5.6、7.2）。RQ 的「抓取」佇列會呼叫這些函式；也可以手動執行：

python -m app.jobs.refresh stations
"""

import logging
import sys
import time

from sqlalchemy import text

from app.collectors.atmovies_import import make_fetcher, refresh_atmovies
from app.collectors.osm_import import refresh_osm
from app.collectors.tdx_geocode import Geocoder, geocode_hubs
from app.collectors.tdx_stations import refresh_stations
from app.config import get_settings
from app.db import sync_session
from app.jobs.crawl import run_crawl
from app.judge import MovieJudge, RestaurantJudge
from app.redis_client import sync_redis
from app.redis_utils.ratelimit import wait_for_slot
from app.tdx import TdxTransit

log = logging.getLogger(__name__)


def make_tdx(s, r) -> TdxTransit:
    """抓取工作用的 TDX：每次請求前等每分鐘 5 次的額度，並檢查、記錄每月點數（5.5）。"""
    return TdxTransit(
        s.tdx_client_id,
        s.tdx_client_secret,
        r,
        timeout=s.http_timeout_seconds,
        limiter=lambda: wait_for_slot(r, "rl:tdx", s.tdx_per_minute, 60_000),
        points_limit=s.quota_tdx_points_units,
    )


def refresh_stations_job() -> dict | None:
    """TDX 軌道車站（每週一 04:00）。"""
    s, r = get_settings(), sync_redis()
    tdx = make_tdx(s, r)
    with sync_session()() as session:
        return run_crawl(
            session,
            r,
            "refresh_stations",
            "tdx_stations",
            lambda keep_alive: refresh_stations(session, r, tdx, s, keep_alive),
        )


def geocode_hubs_job() -> dict | None:
    """商圈代表點的座標。每次都重新整理：示意資料會先填上大概的座標。

    車站代表點用 TDX 車站座標，不花點數；其他的查地標，每個 15 單位。
    """
    s, r = get_settings(), sync_redis()
    tdx = make_tdx(s, r)
    with sync_session()() as session:
        return run_crawl(
            session,
            r,
            "geocode_hubs",
            "geocode",
            lambda keep_alive: geocode_hubs(session, Geocoder(tdx, r, s), False, keep_alive),
        )


def refresh_osm_job() -> dict | None:
    """OSM 餐廳（每天）。屬性交給本機 Ollama 判斷，第一次會比較久。"""
    s, r = get_settings(), sync_redis()
    with sync_session()() as session:
        cuisines = dict(
            session.execute(
                text(
                    "SELECT code, label || '：' || coalesce(jev_description, '') FROM categories "
                    "WHERE kind = 'cuisine' ORDER BY sort_order"
                )
            ).all()
        )
        judge = RestaurantJudge(
            s.ollama_base_url,
            s.ollama_model,
            cuisines=cuisines,
            timeout=s.ollama_timeout_seconds,
            keep_alive=s.ollama_keep_alive,
            think=s.ollama_think,
        )
        return run_crawl(
            session, r, "refresh_osm", "osm",
            lambda keep_alive: refresh_osm(
                session, judge, keep_alive=keep_alive, budget_seconds=s.judge_budget_seconds
            ),
        )  # fmt: skip


def refresh_atmovies_job() -> dict | None:
    """開眼電影網的影城、電影、場次（每天 06:00、18:00）。僅供學術展示（2026-10-20 決定）。"""
    s, r = get_settings(), sync_redis()
    tdx = make_tdx(s, r)
    with sync_session()() as session:
        genres = dict(
            session.execute(
                text(
                    "SELECT code, label || '：' || coalesce(jev_description, '') FROM categories "
                    "WHERE kind = 'movie_genre' ORDER BY sort_order"
                )
            ).all()
        )
        judge = MovieJudge(
            s.ollama_base_url, s.ollama_model, genres=genres, timeout=s.ollama_timeout_seconds,
            keep_alive=s.ollama_keep_alive, think=s.ollama_think,
        )  # fmt: skip
        return run_crawl(
            session, r, "refresh_atmovies", "atmovies",
            lambda keep_alive: refresh_atmovies(
                session, make_fetcher(), Geocoder(tdx, r, s), judge, sleep=time.sleep,
                keep_alive=keep_alive,
            ),
        )  # fmt: skip


JOBS = {
    "stations": refresh_stations_job,
    "hubs": geocode_hubs_job,
    "osm": refresh_osm_job,
    "atmovies": refresh_atmovies_job,
}


def main(argv: list[str]) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if len(argv) != 1 or argv[0] not in JOBS:
        sys.exit(f"用法：python -m app.jobs.refresh {{{'|'.join(JOBS)}}}")
    print(JOBS[argv[0]]())


if __name__ == "__main__":
    main(sys.argv[1:])
