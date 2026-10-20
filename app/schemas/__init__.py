"""API 的請求、回應、SSE 事件（規格書 6.3～6.5）。

時間一律輸出 ISO 8601 並帶 +08:00；`from` 是 Python 保留字，欄位叫 `from_`，輸出時用別名。
規劃結果在 worker 裡先用 `PlanResult` 驗證過才推送，格式出錯會在後端就被抓到。
"""

from datetime import date, datetime, time
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from app.config import get_settings
from app.planning.times import resolve_times


class _Model(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


# ── 下拉選單（6.3） ─────────────────────────────────────────────


class CountyOut(_Model):
    code: str
    name: str
    has_open_areas: bool


class AreaOut(_Model):
    code: str
    name: str
    is_open: bool


class StationOut(_Model):
    id: int
    name: str
    operator: str


class CategoryOut(_Model):
    code: str
    label: str


class CodeLabel(_Model):
    code: str
    label: str


class CoverageMovie(_Model):
    id: int
    title: str
    genre: str | None
    runtime_min: int


RestaurantSourceMode = Literal["google", "osm"]


class CoverageOut(_Model):
    area: str
    showtime_from: date | None
    showtime_to: date | None
    available_dates: list[date]
    movies: list[CoverageMovie] = []
    genres: list[CodeLabel] = []
    hall_types: list[CodeLabel] = []
    languages: list[str] = []
    restaurant_source: RestaurantSourceMode


class StatusOut(_Model):
    jev: dict[str, Any]
    llm: dict[str, Any]
    data_updated_at: dict[str, datetime | None]
    restaurant_source: RestaurantSourceMode


# ── 規劃請求（6.4） ─────────────────────────────────────────────


class PlanRequest(_Model):
    model_config = ConfigDict(extra="ignore")

    area: str = Field(min_length=1)
    origin_station_id: int = Field(gt=0)
    date: date
    earliest_departure: time
    latest_home: time
    order: Literal["movie_first", "meal_first"]
    movie_id: int | None = None
    movie_genre: str | None = None
    hall_type: str | None = None
    language: str | None = None
    cuisine: str | None = None
    budget_per_person: int = Field(gt=0)
    max_walk_minutes: int

    @field_validator("earliest_departure", "latest_home", mode="before")
    @classmethod
    def _hhmm(cls, value: Any) -> Any:
        if isinstance(value, str) and len(value) != 5:
            raise ValueError("時間格式是 HH:MM")
        return value

    @field_serializer("earliest_departure", "latest_home")
    def _dump_hhmm(self, value: time) -> str:
        # 轉交給 worker 時要維持 HH:MM，不能變成 17:00:00
        return value.strftime("%H:%M")

    @field_validator("max_walk_minutes")
    @classmethod
    def _walk_option(cls, value: int) -> int:
        options = get_settings().walk_limit_options
        if value not in options:
            raise ValueError(f"步行上限只能是 {options} 其中之一")
        return value

    @model_validator(mode="after")
    def _times(self) -> "PlanRequest":
        resolve_times(self.date, self.earliest_departure, self.latest_home)
        return self

    def resolved_times(self) -> tuple[datetime, datetime]:
        return resolve_times(self.date, self.earliest_departure, self.latest_home)


# ── 規劃結果（6.5） ─────────────────────────────────────────────

BufferGate = Literal["showtime", "last_order", "return_trip", "latest_return"]
Decider = Literal["jev", "llm"]


class PlaceOut(_Model):
    kind: Literal["station", "hub", "cinema", "restaurant"]
    id: int
    name: str
    lat: float | None = None
    lng: float | None = None
    place_id: str | None = None

    @model_validator(mode="after")
    def _google_has_no_coordinates(self) -> "PlaceOut":
        if self.place_id is not None and (self.lat is not None or self.lng is not None):
            raise ValueError("Google 來源的餐廳不能帶座標（3.3）")
        return self


class ReturnWindow(_Model):
    planned_depart_at: datetime
    minutes_to_planned: int
    latest_depart_at: datetime
    minutes_to_latest: int


class _Step(_Model):
    place: PlaceOut
    buffer_minutes: int | None = None
    buffer_gate: BufferGate | None = None


class TransitStep(_Step):
    type: Literal["transit"]
    from_: str = Field(alias="from")
    to: str
    summary: str
    depart_at: datetime
    arrive_at: datetime
    fare_per_person: int


class WalkStep(_Step):
    type: Literal["walk"]
    from_: str = Field(alias="from")
    to: str
    minutes: int
    arrive_at: datetime
    note: str | None = None
    return_window: ReturnWindow | None = None


class MovieStep(_Step):
    type: Literal["movie"]
    starts_at: datetime
    ends_at: datetime
    return_window: ReturnWindow | None = None


class WaitStep(_Step):
    type: Literal["wait"]
    minutes: int
    note: str | None = None


class MealStep(_Step):
    type: Literal["meal"]
    starts_at: datetime
    ends_at: datetime
    duration: Literal["fast", "normal", "slow"]


class HomeStep(_Step):
    type: Literal["home"]
    station: str
    arrive_at: datetime


Step = Annotated[
    TransitStep | WalkStep | MovieStep | WaitStep | MealStep | HomeStep,
    Field(discriminator="type"),
]


class Highlight(_Model):
    key: Literal["recommended", "cheapest", "safest", "earliest_return", "shortest_walk"]
    label: str
    reason: str


class MovieOut(_Model):
    id: int
    title: str
    genre: str | None
    genre_label: str | None
    runtime_min: int
    cinema: str
    chain: str | None
    hall_type: str
    hall_type_label: str | None
    language: str | None


class RestaurantOut(_Model):
    id: int
    name: str | None
    cuisine: str | None
    cuisine_label: str | None
    address: str | None
    price_range: str | None
    last_order: str | None  # HH:MM
    source: Literal["google", "osm", "demo"]
    place_id: str | None
    hours_verified: bool  # false：營業時間看不懂或補不到，前端要提示「請向店家確認」


class CostOut(_Model):
    ticket: int
    meal: int
    fare_go: int
    fare_return: int
    total: int

    @model_validator(mode="after")
    def _total(self) -> "CostOut":
        if self.total != self.ticket + self.meal + self.fare_go + self.fare_return:
            raise ValueError("total 要等於四項加總")
        return self


class RestaurantAlternative(_Model):
    restaurant_id: int
    name: str | None
    cuisine: str | None
    probability: float
    home_at: datetime
    cost_per_person_total: int
    estimated: Literal[True]


class MovieAlternative(_Model):
    movie_id: int
    title: str
    probability: float
    home_at: datetime
    cost_per_person_total: int
    estimated: Literal[True]
    restaurant_id: int | None
    restaurant_name: str | None
    restaurant_cuisine: str | None


class RouteAlternative(_Model):
    summary: str
    depart_at: datetime
    arrive_at: datetime
    fare_per_person: int
    probability: float


class Alternatives(_Model):
    model_config = ConfigDict(serialize_by_alias=True)

    movie: list[MovieAlternative] | None = None
    restaurant: list[RestaurantAlternative] | None = None
    route_go: list[RouteAlternative] | None = None
    route_return: list[RouteAlternative] | None = None


class PlanOut(_Model):
    rank: int = Field(ge=1, le=3)
    highlight: Highlight | None
    score: float
    probabilities: dict[Literal["movie", "restaurant"], float]
    decided_by: dict[Literal["movie", "restaurant", "route_go", "route_return"], Decider]
    depart_at: datetime
    home_at: datetime
    minutes_before_deadline: int
    min_buffer_minutes: int
    movie: MovieOut
    restaurant: RestaurantOut
    timeline: list[Step]
    cost_per_person: CostOut
    estimated: list[Literal["ticket", "meal", "fare_go", "fare_return"]]
    alternatives: Alternatives


class Stats(_Model):
    combinations: int
    feasible: int


class PlanResult(_Model):
    job_id: str
    restaurant_source: RestaurantSourceMode
    stats: Stats
    plans: list[PlanOut] = Field(min_length=1, max_length=3)

    def to_json(self) -> dict[str, Any]:
        # alternatives 沒有值的 key 不輸出（6.5：只列出沒把握的那幾項）
        data = self.model_dump(mode="json", by_alias=True)
        for plan in data["plans"]:
            plan["alternatives"] = {k: v for k, v in plan["alternatives"].items() if v is not None}
        return data


# ── SSE 事件與錯誤（6.1、6.4） ───────────────────────────────────

Stage = Literal[
    "loading_data",
    "checking_feasibility",
    "filtering",
    "choosing",
    "llm_fallback",
    "verifying_hours",
    "routing",
    "waiting_quota",
    "building_result",
]


class QueuedEvent(_Model):
    job_id: str
    position: int


class ErrorBody(_Model):
    code: str
    message: str
    reasons: dict[str, int] | None = None
