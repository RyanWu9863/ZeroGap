"""依設定建立外部服務的用戶端：mock 用模擬版；real 用真的服務（TDX、Jev；Google 之後）。"""

import redis

from app.config import Settings
from app.jev.base import Jev
from app.jev.client import JevClient
from app.jev.mock import MockJev
from app.llm import Llm, LlmPicker, MockLlm
from app.places import GooglePlaces, MockPlaces, Places
from app.tdx import TdxTransit
from app.transit import MockTransit, Transit


def make_transit(s: Settings, r: redis.Redis) -> Transit:
    if s.tdx_mode == "mock":
        return MockTransit()
    return TdxTransit(
        s.tdx_client_id,
        s.tdx_client_secret,
        r,
        timeout=s.http_timeout_seconds,
        retries=s.http_retries,
        points_limit=s.quota_tdx_points_units,
        # limiter 由 planner 設定，等額度時才能推送 waiting_quota 的進度
    )


def make_jev(s: Settings) -> Jev:
    if s.jev_mode == "mock":
        return MockJev()
    # limiter 由 planner 設定（每分鐘 300 次，重試也算）
    return JevClient(
        s.typesafe_api_key, s.jev_model, timeout=s.http_timeout_seconds, retries=s.http_retries
    )


def make_places(s: Settings) -> Places:
    if s.google_mode == "mock":
        return MockPlaces()
    return GooglePlaces(
        s.google_places_api_key, timeout=s.http_timeout_seconds, retries=s.http_retries
    )


def make_llm(s: Settings) -> Llm:
    if s.llm_mode == "mock":
        return MockLlm()
    return LlmPicker(
        s.ollama_base_url,
        s.ollama_model,
        timeout=s.ollama_timeout_seconds,
        keep_alive=s.ollama_keep_alive,
        think=s.ollama_think,
    )
