"""環境變數與時間規則（規格書 8.2、10.1）。

所有數字都可以用同名的大寫環境變數覆蓋，例如 `WAIT_MINUTES=15`。
dict、list 用 JSON 寫，例如 `MEAL_MINUTES='{"fast": 30, "normal": 60, "slow": 90}'`；
`CORS_ORIGINS` 另外接受逗號分隔。
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- 連線 ---
    database_url: str = "postgresql+psycopg://zerogap:zerogap@localhost:5433/zerogap"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    timezone: str = "Asia/Taipei"

    # --- 外部服務：金鑰到了才切成 real ---
    tdx_mode: Literal["real", "mock"] = "mock"
    tdx_client_id: str = ""
    tdx_client_secret: str = ""
    google_mode: Literal["real", "mock"] = "mock"
    google_places_api_key: str = ""
    jev_mode: Literal["real", "mock"] = "mock"
    typesafe_api_key: str = ""
    jev_model: str = "jev-latest"
    jev_min_top_probability: float = 0.6
    jev_max_options: int = 10
    llm_mode: Literal["ollama", "mock"] = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"
    ollama_timeout_seconds: float = 30.0

    # --- 時間規則（7.1） ---
    arrive_before_showtime_minutes: int = 15
    wait_minutes: int = 10
    meal_minutes: dict[str, int] = {"fast": 45, "normal": 75, "slow": 105}
    last_order_before_close_minutes: int = 30
    walk_detour_factor: float = 1.3
    walk_meters_per_minute: float = 75
    walk_limit_options: list[int] = [5, 8, 12, 15, 20]
    latest_home_cutoff_hour: int = 6  # 早於 06:00 的 latest_home 算隔天
    latest_home_max_hour_next_day: int = 2  # 最晚到隔天 02:00

    # --- 餐費與票價（4.3、7.3） ---
    meal_cost_by_price_range: dict[str, int] = {
        "under_200": 150,
        "200_500": 350,
        "500_1000": 750,
        "over_1000": 1200,
    }
    ticket_round_to: int = 10

    # --- 規劃 ---
    plan_alternatives_max: int = 2
    plan_opening_hours_retry_rounds: int = 2
    plan_timeout_seconds: int = 600
    plan_queue_max_waiting: int = 5
    plan_queue_ttl_seconds: int = 900
    sse_heartbeat_seconds: int = 15

    # --- 限流與額度（5.5） ---
    tdx_per_minute: int = 5
    jev_per_minute: int = 300
    api_plan_per_hour: int = 10
    api_read_per_minute: int = 60
    quota_tdx_points_units: int = 9000
    quota_google_nearby_enterprise: int = 950
    quota_google_details_enterprise: int = 950
    quota_google_details_pro: int = 4750
    quota_google_details_essentials: int = 9500
    quota_jev_cost_micro_usd: int = 1_000_000

    # --- 外部 API 的錯誤處理（8.3） ---
    http_timeout_seconds: float = 10.0
    http_retries: int = 2

    # --- 快取 ---
    route_cache_ttl_seconds: int = 6 * 3600
    route_cache_slot_minutes: int = 15
    llm_status_ttl_seconds: int = 30

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("["):
                import json

                return json.loads(value)
            return [v.strip() for v in value.split(",") if v.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
