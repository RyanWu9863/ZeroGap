"""資料表（規格書 4.3）。SQLAlchemy 2.0 ＋ GeoAlchemy2。

共通規則（4.2）：主鍵 bigint identity；每張表都有 created_at、updated_at；
座標是 geography(Point, 4326)，距離單位是公尺。GiST 索引都明確寫在 __table_args__。
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from geoalchemy2 import Geography
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def point():
    return Geography(geometry_type="POINT", srid=4326, spatial_index=False)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


def pk() -> Mapped[int]:
    return mapped_column(BigInteger, Identity(always=True), primary_key=True)


class County(TimestampMixin, Base):
    __tablename__ = "counties"
    id: Mapped[int] = pk()
    code: Mapped[str] = mapped_column(Text, unique=True)  # TDX 的縣市代碼，例如 Taoyuan
    name: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Area(TimestampMixin, Base):
    __tablename__ = "areas"
    id: Mapped[int] = pk()
    county_id: Mapped[int] = mapped_column(ForeignKey("counties.id"), index=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    is_open: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class AreaHub(TimestampMixin, Base):
    __tablename__ = "area_hubs"
    __table_args__ = (
        UniqueConstraint("area_id", "name"),
        Index("ix_area_hubs_geom", "geom", postgresql_using="gist"),
    )
    id: Mapped[int] = pk()
    area_id: Mapped[int] = mapped_column(ForeignKey("areas.id"), index=True)
    name: Mapped[str] = mapped_column(Text)
    # migration 只寫名稱，座標由地理編碼補上（4.2），所以可以是 null
    geom: Mapped[Any | None] = mapped_column(point(), nullable=True)


class Station(TimestampMixin, Base):
    __tablename__ = "stations"
    __table_args__ = (Index("ix_stations_geom", "geom", postgresql_using="gist"),)
    id: Mapped[int] = pk()
    station_uid: Mapped[str] = mapped_column(Text, unique=True)
    operator: Mapped[str] = mapped_column(Text)  # TRA、THSR、TRTC、TYMC……
    name: Mapped[str] = mapped_column(Text)
    county_id: Mapped[int] = mapped_column(ForeignKey("counties.id"), index=True)
    geom: Mapped[Any] = mapped_column(point())
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Cinema(TimestampMixin, Base):
    __tablename__ = "cinemas"
    __table_args__ = (Index("ix_cinemas_geom", "geom", postgresql_using="gist"),)
    id: Mapped[int] = pk()
    atmovies_id: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    geom: Mapped[Any | None] = mapped_column(point(), nullable=True)
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id"), index=True)
    chain: Mapped[str | None] = mapped_column(Text)
    geocoded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TicketPrice(TimestampMixin, Base):
    __tablename__ = "ticket_prices"
    __table_args__ = (UniqueConstraint("chain", "hall_type"),)
    id: Mapped[int] = pk()
    chain: Mapped[str] = mapped_column(Text)  # default：判斷不出品牌時用
    hall_type: Mapped[str] = mapped_column(Text)
    price_low: Mapped[int] = mapped_column(Integer)
    price_high: Mapped[int] = mapped_column(Integer)


class Movie(TimestampMixin, Base):
    __tablename__ = "movies"
    id: Mapped[int] = pk()
    atmovies_id: Mapped[str] = mapped_column(Text, unique=True)
    title: Mapped[str] = mapped_column(Text)
    runtime_min: Mapped[int] = mapped_column(Integer)
    rating: Mapped[str | None] = mapped_column(Text)
    genre_code: Mapped[str | None] = mapped_column(Text)
    synopsis: Mapped[str | None] = mapped_column(Text)
    language_raw: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text)


class Showtime(TimestampMixin, Base):
    __tablename__ = "showtimes"
    __table_args__ = (
        UniqueConstraint("cinema_id", "movie_id", "starts_at", "version_raw"),
        Index("ix_showtimes_cinema_starts", "cinema_id", "starts_at"),
    )
    id: Mapped[int] = pk()
    cinema_id: Mapped[int] = mapped_column(ForeignKey("cinemas.id", ondelete="CASCADE"))
    movie_id: Mapped[int] = mapped_column(ForeignKey("movies.id", ondelete="CASCADE"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    version_raw: Mapped[str] = mapped_column(Text, default="", server_default=text("''"))
    hall_type: Mapped[str] = mapped_column(Text, default="standard")
    language: Mapped[str | None] = mapped_column(Text)


class Restaurant(TimestampMixin, Base):
    __tablename__ = "restaurants"
    __table_args__ = (
        UniqueConstraint("source", "external_id"),
        Index("ix_restaurants_geom", "geom", postgresql_using="gist"),
        Index("ix_restaurants_area_category", "area_id", "category_code"),
        CheckConstraint("source IN ('google', 'osm', 'demo')", name="restaurants_source"),
        # Google 的店家內容不能存（3.3）：就算程式寫錯，資料庫也會擋下來
        CheckConstraint(
            "source <> 'google' OR "
            "(osm_name IS NULL AND osm_opening_hours IS NULL AND osm_tags IS NULL)",
            name="restaurants_google_no_content",
        ),
        CheckConstraint("date_suitability BETWEEN 0 AND 2", name="restaurants_date_suitability"),
        CheckConstraint(
            "meal_duration IN ('fast', 'normal', 'slow')", name="restaurants_meal_duration"
        ),
        CheckConstraint(
            "price_range IN ('under_200', '200_500', '500_1000', 'over_1000')",
            name="restaurants_price_range",
        ),
    )
    id: Mapped[int] = pk()
    source: Mapped[str] = mapped_column(Text)
    external_id: Mapped[str] = mapped_column(Text)
    geom: Mapped[Any | None] = mapped_column(point(), nullable=True)
    geom_fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id"))
    category_code: Mapped[str | None] = mapped_column(Text)
    date_suitability: Mapped[int | None] = mapped_column(SmallInteger)
    meal_duration: Mapped[str | None] = mapped_column(Text)
    price_range: Mapped[str | None] = mapped_column(Text)
    osm_name: Mapped[str | None] = mapped_column(Text)
    osm_opening_hours: Mapped[str | None] = mapped_column(Text)
    osm_tags: Mapped[dict | None] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Category(TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("kind", "code"),)
    id: Mapped[int] = pk()
    kind: Mapped[str] = mapped_column(Text)  # movie_genre、cuisine
    code: Mapped[str] = mapped_column(Text)
    label: Mapped[str] = mapped_column(Text)
    jev_description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class JevJudgment(TimestampMixin, Base):
    __tablename__ = "jev_judgments"
    __table_args__ = (
        UniqueConstraint("subject_type", "subject_id", "question"),
        Index("ix_jev_judgments_jev_version", "jev_version"),
        Index("ix_jev_judgments_judged_at", "judged_at"),
    )
    id: Mapped[int] = pk()
    subject_type: Mapped[str] = mapped_column(Text)  # movie、cinema、restaurant
    subject_id: Mapped[int] = mapped_column(BigInteger)  # 多型關聯，不設外鍵
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    probabilities: Mapped[dict] = mapped_column(JSONB)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    decided_by: Mapped[str] = mapped_column(Text)  # jev、llm
    model_version: Mapped[str] = mapped_column(Text)
    jev_version: Mapped[str] = mapped_column(Text)
    judged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CrawlRun(TimestampMixin, Base):
    __tablename__ = "crawl_runs"
    __table_args__ = (Index("ix_crawl_runs_job_started", "job", text("started_at DESC")),)
    id: Mapped[int] = pk()
    job: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)  # running、success、failed
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stats: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
