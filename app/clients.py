"""依設定建立外部服務的用戶端：mock 用模擬版；real 要等第二階段（金鑰到了才做）。"""

from app.config import Settings
from app.jev.base import Jev
from app.jev.mock import MockJev
from app.llm import Llm, LlmPicker, MockLlm
from app.places import MockPlaces, Places
from app.transit import MockTransit, Transit


def make_transit(s: Settings) -> Transit:
    if s.tdx_mode == "mock":
        return MockTransit()
    raise NotImplementedError("真的 TDX 用戶端第二階段才做；先把 TDX_MODE 設成 mock")


def make_jev(s: Settings) -> Jev:
    if s.jev_mode == "mock":
        return MockJev()
    raise NotImplementedError("真的 Jev 用戶端第二階段才做；先把 JEV_MODE 設成 mock")


def make_places(s: Settings) -> Places:
    if s.google_mode == "mock":
        return MockPlaces()
    raise NotImplementedError("真的 Google Places 用戶端第二階段才做；先把 GOOGLE_MODE 設成 mock")


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
