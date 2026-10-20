"""示意種子資料（第一階段用）：`python -m app.seed.demo`

- 影城、電影、餐廳的名稱一律帶「示意」；車站、代表點是真的地名，座標是大概的位置
- 車站代碼用 `demo-` 開頭，不冒用 TDX 的代碼；餐廳的 source 是 `demo`
- 場次是今天起 7 天，第 4 天故意空著，讓前端測「沒資料的日子灰掉」
- 用 UPSERT 寫入，執行幾次結果都一樣；結果固定（亂數有固定的種子）
"""

import math
import random
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import sync_session
from app.models import Area, AreaHub, Cinema, County, CrawlRun, Movie, Restaurant, Showtime, Station

TZ = ZoneInfo("Asia/Taipei")
DAYS = 7
EMPTY_DAY = 3  # 第 4 天沒有場次

# (代碼, 業者, 站名, 縣市, 緯度, 經度)
STATIONS = [
    ("demo-TRA-taoyuan", "TRA", "桃園", "Taoyuan", 24.9891, 121.3138),
    ("demo-TRA-neili", "TRA", "內壢", "Taoyuan", 24.9727, 121.2585),
    ("demo-TRA-zhongli", "TRA", "中壢", "Taoyuan", 24.9537, 121.2257),
    ("demo-TRA-puxin", "TRA", "埔心", "Taoyuan", 24.9196, 121.1836),
    ("demo-TRA-yangmei", "TRA", "楊梅", "Taoyuan", 24.9145, 121.1460),
    ("demo-TRA-fugang", "TRA", "富岡", "Taoyuan", 24.9346, 121.0848),
    ("demo-THSR-taoyuan", "THSR", "桃園", "Taoyuan", 25.0130, 121.2150),
    ("demo-TYMC-A12", "TYMC", "機場第一航廈", "Taoyuan", 25.0810, 121.2378),
    ("demo-TYMC-A18", "TYMC", "高鐵桃園站", "Taoyuan", 25.0136, 121.2152),
    ("demo-TYMC-A19", "TYMC", "桃園體育園區", "Taoyuan", 24.9997, 121.2043),
    ("demo-TYMC-A21", "TYMC", "環北", "Taoyuan", 24.9675, 121.2214),
    ("demo-TRA-taipei", "TRA", "臺北", "Taipei", 25.0478, 121.5170),
    ("demo-TRA-banqiao", "TRA", "板橋", "NewTaipei", 25.0143, 121.4632),
]

# 代表點的座標（示意）；之後由 TDX 地理編碼補上真的座標
HUB_COORDS = {
    "桃園站": (24.9891, 121.3138),
    "中壢站": (24.9537, 121.2257),
    "高鐵桃園站": (25.0130, 121.2150),
    "大湳": (24.9550, 121.2910),
    "廣豐新天地": (24.9440, 121.2990),
    "台茂購物中心": (25.0503, 121.2935),
}

# (代碼, 名稱, 商圈, 品牌, 緯度, 經度)；中壢 B 故意不指定品牌，票價會用 default
CINEMAS = [
    ("demo-taoyuan-a", "示意影城 桃園 A", "taoyuan", "vieshow", 24.9918, 121.3110),
    ("demo-taoyuan-b", "示意影城 桃園 B", "taoyuan", "showtime", 24.9858, 121.3075),
    ("demo-zhongli-a", "示意影城 中壢 A", "zhongli", "skcinemas", 24.9575, 121.2236),
    ("demo-zhongli-b", "示意影城 中壢 B", "zhongli", None, 24.9512, 121.2290),
    ("demo-qingpu-a", "示意影城 青埔 A", "qingpu", "vieshow", 25.0105, 121.2185),
    ("demo-bade-a", "示意影城 八德 A", "bade", "in89", 24.9455, 121.2972),
]

SPECIAL_HALLS = {
    "vieshow": ["imax", "4dx", "titan"],
    "showtime": ["screenx", "4dx"],
    "skcinemas": ["dolby", "mx4d"],
    "in89": ["imax", "mx4d"],
}
HALL_LABELS = {
    "standard": "數位", "imax": "IMAX", "4dx": "4DX", "titan": "TITAN", "screenx": "ScreenX",
    "dolby": "杜比影院", "mx4d": "MX4D", "dbox": "D-BOX", "premium": "尊爵廳",
}  # fmt: skip

# (代碼, 片名, 片型, 片長, 分級, 語言, 出品國)
MOVIES = [
    ("demo-m1", "示意電影：極速追擊", "action", 128, "輔12級", "英語", "美國"),
    ("demo-m2", "示意電影：星河小旅人", "animation", 105, "普遍級", "日語", "日本"),
    ("demo-m3", "示意電影：今晚月色真美", "romance", 112, "保護級", "中文", "臺灣"),
    ("demo-m4", "示意電影：爆笑同學會", "comedy", 98, "普遍級", "中文", "臺灣"),
    ("demo-m5", "示意電影：深夜的敲門聲", "horror", 95, "限制級", "韓語", "韓國"),
    ("demo-m6", "示意電影：遠方的燈塔", "drama", 140, "保護級", "英語", "英國"),
]

CUISINES = [
    ("japanese", "日式"), ("chinese", "中式"), ("western", "西式"),
    ("korean", "韓式"), ("american", "美式"), ("other", "其他"),
]  # fmt: skip
OPENING_HOURS = [
    "Mo-Su 11:00-21:30",
    "Mo-Su 11:30-14:30,17:00-21:30",
    "Mo-Su 11:00-22:00",
    "Tu-Su 11:00-22:00; Mo off",
    "Mo-Su 17:00-01:00",
    "Mo-Su 18:00-02:00",
    "Mo-Su 10:00-21:00",
]
RESTAURANTS_PER_AREA = 15


def _ewkt(lat: float, lng: float) -> str:
    return f"SRID=4326;POINT({lng} {lat})"


def _offset(lat: float, lng: float, meters: float, bearing: float) -> tuple[float, float]:
    dy = meters * math.cos(bearing)
    dx = meters * math.sin(bearing)
    return (
        round(lat + dy / 111_320, 6),
        round(lng + dx / (111_320 * math.cos(math.radians(lat))), 6),
    )


def _upsert(session: Session, model, rows: list[dict], keys: list[str]) -> None:
    if not rows:
        return
    stmt = insert(model).values(rows)
    update_cols = {c: stmt.excluded[c] for c in rows[0] if c not in keys}
    update_cols["updated_at"] = func.now()
    session.execute(stmt.on_conflict_do_update(index_elements=keys, set_=update_cols))


def _ids(session: Session, model, key: str) -> dict:
    return {k: i for k, i in session.execute(select(getattr(model, key), model.id))}


def seed(session: Session, today: date | None = None) -> dict[str, int]:
    today = today or datetime.now(TZ).date()
    counties = _ids(session, County, "code")
    areas = _ids(session, Area, "code")
    # 已經匯入真的車站、餐廳時，示意的只寫入、不啟用，免得跟真資料混在一起
    real_stations = bool(
        session.scalar(
            select(func.count())
            .select_from(Station)
            .where(Station.is_active, Station.station_uid.not_like("demo-%"))
        )
    )
    real_restaurants = bool(
        session.scalar(
            select(func.count())
            .select_from(Restaurant)
            .where(Restaurant.is_active, Restaurant.source != "demo")
        )
    )

    _upsert(
        session,
        Station,
        [
            {"station_uid": uid, "operator": op, "name": name, "county_id": counties[county],
             "geom": _ewkt(lat, lng), "is_active": not real_stations}
            for uid, op, name, county, lat, lng in STATIONS
        ],
        ["station_uid"],
    )  # fmt: skip

    for name, (lat, lng) in HUB_COORDS.items():
        session.execute(
            update(AreaHub)
            .where(AreaHub.name == name, AreaHub.geom.is_(None))
            .values(geom=_ewkt(lat, lng))
        )

    _upsert(
        session,
        Cinema,
        [
            {"atmovies_id": aid, "name": name, "address": f"{name}（示意地址）",
             "geom": _ewkt(lat, lng), "area_id": areas[area], "chain": chain,
             "geocoded_at": datetime.combine(today, time(6), TZ), "is_active": True}
            for aid, name, area, chain, lat, lng in CINEMAS
        ],
        ["atmovies_id"],
    )  # fmt: skip

    _upsert(
        session,
        Movie,
        [
            {"atmovies_id": aid, "title": title, "runtime_min": runtime, "rating": rating,
             "genre_code": genre, "synopsis": f"{title}的劇情簡介（示意）",
             "language_raw": lang, "country": country}
            for aid, title, genre, runtime, rating, lang, country in MOVIES
        ],
        ["atmovies_id"],
    )  # fmt: skip

    cinema_ids = _ids(session, Cinema, "atmovies_id")
    movie_ids = _ids(session, Movie, "atmovies_id")
    showtime_rows = _showtimes(today, cinema_ids, movie_ids)
    for i in range(0, len(showtime_rows), 500):
        _upsert(
            session,
            Showtime,
            showtime_rows[i : i + 500],
            ["cinema_id", "movie_id", "starts_at", "version_raw"],
        )
    # 過期場次：跟每天抓取時一樣刪掉（4.5）
    session.execute(
        delete(Showtime).where(Showtime.starts_at < datetime.combine(today, time(0), TZ))
    )

    restaurants = _restaurants(areas)
    for row in restaurants:
        row["is_active"] = not real_restaurants
    _upsert(session, Restaurant, restaurants, ["source", "external_id"])

    now = datetime.now(TZ)
    for job in ("atmovies", "osm"):
        session.add(
            CrawlRun(job=job, status="success", started_at=now, finished_at=now,
                     stats={"demo": True})
        )  # fmt: skip
    session.commit()

    return {
        "stations": session.scalar(select(func.count()).select_from(Station)),
        "cinemas": session.scalar(select(func.count()).select_from(Cinema)),
        "movies": session.scalar(select(func.count()).select_from(Movie)),
        "showtimes": session.scalar(select(func.count()).select_from(Showtime)),
        "restaurants": session.scalar(select(func.count()).select_from(Restaurant)),
    }


def _showtimes(today: date, cinema_ids: dict, movie_ids: dict) -> list[dict]:
    rows = []
    movies = {m[0]: m for m in MOVIES}
    for day in range(DAYS):
        if day == EMPTY_DAY:
            continue
        d = today + timedelta(days=day)
        for aid, _name, _area, chain, _lat, _lng in CINEMAS:
            rng = random.Random(f"{aid}-{d.isoformat()}")
            specials = SPECIAL_HALLS.get(chain or "", [])
            start = datetime.combine(d, time(10, 0), TZ) + timedelta(
                minutes=rng.randrange(0, 30, 5)
            )
            for slot in range(12):
                movie = movies[MOVIES[(slot + rng.randrange(6)) % 6][0]]
                code, _title, _genre, runtime, _rating, lang, _country = movie
                hall = specials[slot % len(specials)] if specials and slot % 4 == 3 else "standard"
                # 動畫有時是國語配音
                language = "中文" if code == "demo-m2" and slot % 3 == 0 else lang
                starts = start + timedelta(minutes=slot * 70 + rng.randrange(0, 15, 5))
                rows.append(
                    {"cinema_id": cinema_ids[aid], "movie_id": movie_ids[code],
                     "starts_at": starts, "ends_at": starts + timedelta(minutes=runtime),
                     "version_raw": f"{HALL_LABELS[hall]} {language}版",
                     "hall_type": hall, "language": language}
                )  # fmt: skip
    return rows


def _restaurants(areas: dict) -> list[dict]:
    rows = []
    area_names = {"taoyuan": "桃園", "zhongli": "中壢", "qingpu": "青埔", "bade": "八德"}
    for area_code, area_name in area_names.items():
        rng = random.Random(f"restaurants-{area_code}")
        cinemas = [c for c in CINEMAS if c[2] == area_code]
        for n in range(1, RESTAURANTS_PER_AREA + 1):
            cuisine, label = CUISINES[(n - 1) % len(CUISINES)]
            _aid, _name, _area, _chain, clat, clng = cinemas[n % len(cinemas)]
            # 大部分在影城步行 15 分鐘內，少數比較遠
            meters = rng.choice([150, 300, 450, 600, 800, 1000, 1400])
            lat, lng = _offset(clat, clng, meters, rng.uniform(0, 2 * math.pi))
            hours = OPENING_HOURS[rng.randrange(len(OPENING_HOURS))]
            rows.append(
                {"source": "demo", "external_id": f"demo-{area_code}-{n:02d}",
                 "geom": _ewkt(lat, lng), "geom_fetched_at": None, "area_id": areas[area_code],
                 "category_code": cuisine, "date_suitability": rng.randint(0, 2),
                 "meal_duration": rng.choice(["fast", "normal", "normal", "slow"]),
                 "price_range": rng.choice(["under_200", "200_500", "200_500", "500_1000",
                                            "over_1000"]),
                 "osm_name": f"示意{label}餐廳 {area_name} {n:02d}",
                 "osm_opening_hours": hours, "osm_tags": {"demo": True, "cuisine": cuisine},
                 "is_active": True}
            )  # fmt: skip
    return rows


def main() -> None:
    settings = get_settings()
    with sync_session()() as session:
        counts = seed(session)
    print(f"示意種子資料已寫入 {settings.database_url.rsplit('@', 1)[-1]}：{counts}")


if __name__ == "__main__":
    main()
