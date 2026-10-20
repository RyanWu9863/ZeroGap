"""資料更新的工作（規格書 5.6、7.2）。RQ 的「抓取」佇列會呼叫這些函式；也可以手動執行：

python -m app.jobs.refresh stations
"""

import logging
import sys

from sqlalchemy import text

from app.collectors.osm_import import refresh_osm
from app.collectors.tdx_geocode import Geocoder, geocode_hubs
from app.collectors.tdx_stations import refresh_stations
from app.config import get_settings
from app.db import sync_session
from app.jobs.crawl import run_crawl
from app.judge import RestaurantJudge
from app.redis_client import sync_redis
from app.tdx import TdxTransit

log = logging.getLogger(__name__)


def refresh_stations_job() -> dict | None:
    """TDX 軌道車站（每週一 04:00）。"""
    s, r = get_settings(), sync_redis()
    tdx = TdxTransit(s.tdx_client_id, s.tdx_client_secret, r, timeout=s.http_timeout_seconds)
    with sync_session()() as session:
        return run_crawl(
            session,
            r,
            "refresh_stations",
            "tdx_stations",
            lambda keep_alive: refresh_stations(session, r, tdx, s, keep_alive),
        )


def geocode_hubs_job() -> dict | None:
    """商圈代表點的座標（只補還沒有座標的）。"""
    s, r = get_settings(), sync_redis()
    tdx = TdxTransit(s.tdx_client_id, s.tdx_client_secret, r, timeout=s.http_timeout_seconds)
    with sync_session()() as session:
        return run_crawl(
            session,
            r,
            "geocode_hubs",
            "geocode",
            lambda keep_alive: geocode_hubs(session, Geocoder(tdx, r, s), True, keep_alive),
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
            lambda keep_alive: refresh_osm(session, judge, keep_alive=keep_alive),
        )  # fmt: skip


JOBS = {"stations": refresh_stations_job, "hubs": geocode_hubs_job, "osm": refresh_osm_job}


def main(argv: list[str]) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if len(argv) != 1 or argv[0] not in JOBS:
        sys.exit(f"用法：python -m app.jobs.refresh {{{'|'.join(JOBS)}}}")
    print(JOBS[argv[0]]())


if __name__ == "__main__":
    main(sys.argv[1:])
