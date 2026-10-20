"""第一個 migration：PostGIS、全部的資料表、固定資料（規格書 4.2、4.3）

固定資料：縣市（TDX 代碼）、4 個商圈和代表點的名稱、片型和料理類別、票價參考。
代表點的座標由地理編碼補上，這裡只寫名稱。

Revision ID: 0001
Revises:
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COUNTIES = [
    ("Taoyuan", "桃園市"), ("Taipei", "臺北市"), ("NewTaipei", "新北市"), ("Keelung", "基隆市"),
    ("Hsinchu", "新竹市"), ("HsinchuCounty", "新竹縣"), ("MiaoliCounty", "苗栗縣"),
    ("Taichung", "臺中市"), ("ChanghuaCounty", "彰化縣"), ("NantouCounty", "南投縣"),
    ("YunlinCounty", "雲林縣"), ("Chiayi", "嘉義市"), ("ChiayiCounty", "嘉義縣"),
    ("Tainan", "臺南市"), ("Kaohsiung", "高雄市"), ("PingtungCounty", "屏東縣"),
    ("YilanCounty", "宜蘭縣"), ("HualienCounty", "花蓮縣"), ("TaitungCounty", "臺東縣"),
    ("PenghuCounty", "澎湖縣"), ("KinmenCounty", "金門縣"), ("LienchiangCounty", "連江縣"),
]  # fmt: skip

AREAS = [("taoyuan", "桃園區"), ("zhongli", "中壢"), ("qingpu", "青埔"), ("bade", "八德")]

HUBS = [
    ("taoyuan", "桃園站"),  # 【預設】
    ("zhongli", "中壢站"),  # 【預設】
    ("qingpu", "高鐵桃園站"),  # 【預設】
    ("bade", "大湳"),  # 團隊決定
    ("bade", "廣豐新天地"),  # 團隊決定
]

CUISINES = [
    ("western", "西式", "義式、法式等歐式料理，例如義大利麵、燉飯、排餐、披薩、西式早午餐"),
    ("chinese", "中式", "台菜、川菜、粵菜、港式、熱炒、小吃、麵食、中式點心"),
    ("american", "美式", "漢堡、炸雞、美式餐廳、牛排館、美式早午餐、BBQ"),
    ("japanese", "日式", "壽司、拉麵、丼飯、豬排、居酒屋、日式定食、燒肉"),
    ("korean", "韓式", "韓式烤肉、韓式炸雞、部隊鍋、拌飯、豆腐鍋"),
    ("other", "其他", "不屬於以上任何一類，例如東南亞、印度、中東料理"),
]

# 片型主清單【預設】；給 Jev 的說明是實作時補的【預設】
GENRES = [
    ("action", "動作", "打鬥、追逐、爆破為主"),
    ("adventure", "冒險", "探險、旅程、尋寶"),
    ("comedy", "喜劇", "以搞笑、輕鬆為主"),
    ("romance", "愛情", "以感情、戀愛為主軸"),
    ("drama", "劇情", "人物與故事為主的劇情片"),
    ("horror", "恐怖", "驚嚇、鬼怪、血腥"),
    ("thriller", "驚悚懸疑", "懸疑、犯罪、推理、心理驚悚"),
    ("scifi", "科幻", "未來科技、太空、外星人"),
    ("fantasy", "奇幻", "魔法、神話、超自然世界"),
    ("animation", "動畫", "動畫電影，不分題材"),
    ("family", "家庭", "適合全家觀看、親子題材"),
    ("documentary", "紀錄片", "真人真事的紀錄片"),
    ("music", "音樂", "音樂劇、演唱會電影、音樂人傳記"),
    ("other", "其他", "不屬於以上任何一類"),
]

# 團隊提供（2026-10）；「約 480」這類單一數字，最低和最高填同一個值
TICKET_PRICES = [
    ("vieshow", "standard", 300, 400), ("vieshow", "imax", 400, 470),
    ("vieshow", "4dx", 520, 570), ("vieshow", "titan", 270, 340),
    ("showtime", "standard", 310, 400), ("showtime", "screenx", 420, 520),
    ("showtime", "4dx", 550, 610),
    ("ambassador", "standard", 290, 320), ("ambassador", "dbox", 530, 580),
    ("ambassador", "premium", 390, 440),
    ("skcinemas", "standard", 310, 370), ("skcinemas", "dolby", 480, 480),
    ("skcinemas", "mx4d", 560, 560),
    ("in89", "standard", 300, 340), ("in89", "imax", 420, 420), ("in89", "mx4d", 530, 530),
    ("default", "standard", 300, 350),
]  # fmt: skip


def _id() -> sa.Column:
    return sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
    ]  # fmt: skip


def _point() -> Geography:
    return Geography(geometry_type="POINT", srid=4326, spatial_index=False)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "counties", _id(),
        sa.Column("code", sa.Text, nullable=False, unique=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False),
        *_timestamps(),
    )  # fmt: skip
    op.create_table(
        "areas", _id(),
        sa.Column("county_id", sa.BigInteger, sa.ForeignKey("counties.id"), nullable=False),
        sa.Column("code", sa.Text, nullable=False, unique=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("is_open", sa.Boolean, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False),
        *_timestamps(),
    )  # fmt: skip
    op.create_index("ix_areas_county_id", "areas", ["county_id"])
    op.create_table(
        "area_hubs", _id(),
        sa.Column("area_id", sa.BigInteger, sa.ForeignKey("areas.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("geom", _point(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("area_id", "name"),
    )  # fmt: skip
    op.create_index("ix_area_hubs_area_id", "area_hubs", ["area_id"])
    op.create_index("ix_area_hubs_geom", "area_hubs", ["geom"], postgresql_using="gist")

    op.create_table(
        "stations", _id(),
        sa.Column("station_uid", sa.Text, nullable=False, unique=True),
        sa.Column("operator", sa.Text, nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("county_id", sa.BigInteger, sa.ForeignKey("counties.id"), nullable=False),
        sa.Column("geom", _point(), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False),
        *_timestamps(),
    )  # fmt: skip
    op.create_index("ix_stations_county_id", "stations", ["county_id"])
    op.create_index("ix_stations_geom", "stations", ["geom"], postgresql_using="gist")

    op.create_table(
        "cinemas", _id(),
        sa.Column("atmovies_id", sa.Text, nullable=False, unique=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("address", sa.Text),
        sa.Column("geom", _point(), nullable=True),
        sa.Column("area_id", sa.BigInteger, sa.ForeignKey("areas.id")),
        sa.Column("chain", sa.Text),
        sa.Column("geocoded_at", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean, nullable=False),
        *_timestamps(),
    )  # fmt: skip
    op.create_index("ix_cinemas_area_id", "cinemas", ["area_id"])
    op.create_index("ix_cinemas_geom", "cinemas", ["geom"], postgresql_using="gist")

    op.create_table(
        "ticket_prices", _id(),
        sa.Column("chain", sa.Text, nullable=False),
        sa.Column("hall_type", sa.Text, nullable=False),
        sa.Column("price_low", sa.Integer, nullable=False),
        sa.Column("price_high", sa.Integer, nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("chain", "hall_type"),
    )  # fmt: skip

    op.create_table(
        "movies", _id(),
        sa.Column("atmovies_id", sa.Text, nullable=False, unique=True),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("runtime_min", sa.Integer, nullable=False),
        sa.Column("rating", sa.Text),
        sa.Column("genre_code", sa.Text),
        sa.Column("synopsis", sa.Text),
        sa.Column("language_raw", sa.Text),
        sa.Column("country", sa.Text),
        *_timestamps(),
    )  # fmt: skip

    op.create_table(
        "showtimes", _id(),
        sa.Column("cinema_id", sa.BigInteger, sa.ForeignKey("cinemas.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("movie_id", sa.BigInteger, sa.ForeignKey("movies.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version_raw", sa.Text, nullable=False, server_default=sa.text("''")),
        sa.Column("hall_type", sa.Text, nullable=False),
        sa.Column("language", sa.Text),
        *_timestamps(),
        sa.UniqueConstraint("cinema_id", "movie_id", "starts_at", "version_raw"),
    )  # fmt: skip
    op.create_index("ix_showtimes_cinema_starts", "showtimes", ["cinema_id", "starts_at"])

    op.create_table(
        "restaurants", _id(),
        sa.Column("source", sa.Text, nullable=False),
        sa.Column("external_id", sa.Text, nullable=False),
        sa.Column("geom", _point(), nullable=True),
        sa.Column("geom_fetched_at", sa.DateTime(timezone=True)),
        sa.Column("area_id", sa.BigInteger, sa.ForeignKey("areas.id")),
        sa.Column("category_code", sa.Text),
        sa.Column("date_suitability", sa.SmallInteger),
        sa.Column("meal_duration", sa.Text),
        sa.Column("price_range", sa.Text),
        sa.Column("osm_name", sa.Text),
        sa.Column("osm_opening_hours", sa.Text),
        sa.Column("osm_tags", JSONB),
        sa.Column("is_active", sa.Boolean, nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("source", "external_id"),
        sa.CheckConstraint("source IN ('google', 'osm', 'demo')", name="restaurants_source"),
        sa.CheckConstraint(
            "source <> 'google' OR "
            "(osm_name IS NULL AND osm_opening_hours IS NULL AND osm_tags IS NULL)",
            name="restaurants_google_no_content",
        ),
        sa.CheckConstraint("date_suitability BETWEEN 0 AND 2",
                           name="restaurants_date_suitability"),
        sa.CheckConstraint("meal_duration IN ('fast', 'normal', 'slow')",
                           name="restaurants_meal_duration"),
        sa.CheckConstraint("price_range IN ('under_200', '200_500', '500_1000', 'over_1000')",
                           name="restaurants_price_range"),
    )  # fmt: skip
    op.create_index("ix_restaurants_geom", "restaurants", ["geom"], postgresql_using="gist")
    op.create_index("ix_restaurants_area_category", "restaurants", ["area_id", "category_code"])

    op.create_table(
        "categories", _id(),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("code", sa.Text, nullable=False),
        sa.Column("label", sa.Text, nullable=False),
        sa.Column("jev_description", sa.Text),
        sa.Column("sort_order", sa.Integer, nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("kind", "code"),
    )  # fmt: skip

    op.create_table(
        "jev_judgments", _id(),
        sa.Column("subject_type", sa.Text, nullable=False),
        sa.Column("subject_id", sa.BigInteger, nullable=False),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("answer", sa.Text, nullable=False),
        sa.Column("probabilities", JSONB, nullable=False),
        sa.Column("confidence", sa.Numeric(4, 3)),
        sa.Column("decided_by", sa.Text, nullable=False),
        sa.Column("model_version", sa.Text, nullable=False),
        sa.Column("jev_version", sa.Text, nullable=False),
        sa.Column("judged_at", sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("subject_type", "subject_id", "question"),
    )  # fmt: skip
    op.create_index("ix_jev_judgments_jev_version", "jev_judgments", ["jev_version"])
    op.create_index("ix_jev_judgments_judged_at", "jev_judgments", ["judged_at"])

    op.create_table(
        "crawl_runs", _id(),
        sa.Column("job", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("stats", JSONB),
        sa.Column("error", sa.Text),
        *_timestamps(),
    )  # fmt: skip
    op.create_index("ix_crawl_runs_job_started", "crawl_runs", ["job", sa.text("started_at DESC")])

    _insert_reference_data()


def _insert_reference_data() -> None:
    conn = op.get_bind()
    for i, (code, name) in enumerate(COUNTIES):
        conn.execute(
            sa.text("INSERT INTO counties (code, name, sort_order) VALUES (:c, :n, :o)"),
            {"c": code, "n": name, "o": i},
        )
    for i, (code, name) in enumerate(AREAS):
        conn.execute(
            sa.text(
                "INSERT INTO areas (county_id, code, name, is_open, sort_order) "
                "SELECT id, :c, :n, true, :o FROM counties WHERE code = 'Taoyuan'"
            ),
            {"c": code, "n": name, "o": i},
        )
    for area, name in HUBS:
        conn.execute(
            sa.text(
                "INSERT INTO area_hubs (area_id, name) SELECT id, :n FROM areas WHERE code = :a"
            ),
            {"a": area, "n": name},
        )
    for kind, rows in (("cuisine", CUISINES), ("movie_genre", GENRES)):
        for i, (code, label, desc) in enumerate(rows):
            conn.execute(
                sa.text(
                    "INSERT INTO categories (kind, code, label, jev_description, sort_order) "
                    "VALUES (:k, :c, :l, :d, :o)"
                ),
                {"k": kind, "c": code, "l": label, "d": desc, "o": i},
            )
    for chain, hall, low, high in TICKET_PRICES:
        conn.execute(
            sa.text(
                "INSERT INTO ticket_prices (chain, hall_type, price_low, price_high) "
                "VALUES (:c, :h, :lo, :hi)"
            ),
            {"c": chain, "h": hall, "lo": low, "hi": high},
        )


def downgrade() -> None:
    for table in (
        "crawl_runs", "jev_judgments", "categories", "restaurants", "showtimes", "movies",
        "ticket_prices", "cinemas", "stations", "area_hubs", "areas", "counties",
    ):  # fmt: skip
        op.drop_table(table)
    # postgis 留著：映像檔建立資料庫時就裝好了，其他東西也可能用到
