"""OpenTelemetry 追蹤：把一次規劃拆成 API → RQ 佇列 → worker → planner 各階段的 span。

`OTEL_ENABLED=false`（預設）時 `tracer()` 是 NoOpTracer，不產生 span、不連任何服務，
行為和沒有追蹤時完全相同。開啟時由 `setup_tracing` 建立 TracerProvider，用 OTLP/HTTP 送出。

追蹤只是記錄：這裡的函式自己出錯只記警告，不能讓規劃失敗；包住的程式丟出的例外照常往外丟。
span 的 attributes 只放代碼、狀態、數字和時間，**不放 prompt、使用者的偏好或金鑰**。
例外只記類別名稱（`error.type`），不記例外訊息：訊息可能含使用者輸入。
"""

import logging
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from typing import Any

from opentelemetry import context as otel_context
from opentelemetry import propagate, trace
from opentelemetry.trace import NonRecordingSpan, Span, Status, StatusCode

from app.config import Settings

log = logging.getLogger(__name__)

_INSTRUMENTATION = "zerogap"
# None：追蹤關閉。測試可以直接換成接 InMemorySpanExporter 的 provider
_provider: Any = None
_NOOP = trace.NoOpTracer()
_INVALID = NonRecordingSpan(trace.INVALID_SPAN_CONTEXT)

AttrValue = str | bool | int | float


def setup_tracing(settings: Settings, service_name: str) -> None:
    """開啟時建立 provider（同一個程序只建一次）。關閉時什麼都不做。"""
    global _provider
    if not settings.otel_enabled or _provider is not None:
        return
    try:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
        exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        _provider = provider
    except Exception:  # noqa: BLE001
        log.warning("OpenTelemetry 初始化失敗，這次不追蹤", exc_info=True)


def set_provider(provider: Any) -> None:
    """測試和示範腳本用：換成自己的 provider（None 是關閉）。"""
    global _provider
    _provider = provider


def enabled() -> bool:
    return _provider is not None


def tracer() -> trace.Tracer:
    if _provider is None:
        return _NOOP
    try:
        return _provider.get_tracer(_INSTRUMENTATION)
    except Exception:  # noqa: BLE001
        log.warning("取不到 tracer，這段不追蹤", exc_info=True)
        return _NOOP


def flush() -> None:
    """RQ 的 work horse 做完工作會直接結束，不會跑 atexit，要自己把 span 送出去。"""
    if _provider is None:
        return
    try:
        _provider.force_flush(5_000)
    except Exception:  # noqa: BLE001
        log.warning("OpenTelemetry 送出 span 失敗", exc_info=True)


def _clean(attrs: Mapping[str, Any] | None) -> dict[str, AttrValue]:
    # None 不放；其他非基本型別轉成字串，避免 SDK 丟掉或報錯
    out: dict[str, AttrValue] = {}
    for key, value in (attrs or {}).items():
        if value is None:
            continue
        out[key] = value if isinstance(value, str | bool | int | float) else str(value)
    return out


def set_attrs(span: Span, attrs: Mapping[str, Any]) -> None:
    try:
        if span.is_recording():
            span.set_attributes(_clean(attrs))
    except Exception:  # noqa: BLE001
        log.warning("span attributes 寫不進去", exc_info=True)


def set_error(span: Span, description: str) -> None:
    try:
        if span.is_recording():
            span.set_status(Status(StatusCode.ERROR, description))
    except Exception:  # noqa: BLE001
        log.warning("span status 寫不進去", exc_info=True)


def current_span() -> Span:
    try:
        return trace.get_current_span()
    except Exception:  # noqa: BLE001
        return _INVALID


@contextmanager
def span(
    name: str,
    attributes: Mapping[str, Any] | None = None,
    parent: otel_context.Context | None = None,
) -> Iterator[Span]:
    """開一個 span 並設成目前的 span。追蹤出錯時給一個不記錄的 span，程式照常執行。

    包住的程式丟出 Exception 時，status 設成 ERROR、`error.type` 記例外類別名稱，原例外照常往外丟。
    """
    try:
        # SDK 預設會把 str(exc) 寫進 exception event 和 status description，
        # 例外訊息可能含使用者輸入（例如 ValidationError 的輸入值、不存在的商圈代碼），所以關掉
        cm = tracer().start_as_current_span(
            name,
            context=parent,
            attributes=_clean(attributes),
            record_exception=False,
            set_status_on_exception=False,
        )
        current = cm.__enter__()
    except Exception:  # noqa: BLE001
        log.warning("span %s 開不起來，這段不追蹤", name, exc_info=True)
        yield _INVALID
        return
    try:
        yield current
    except BaseException as exc:
        # GeneratorExit、CancelledError 不是 Exception：generator 被關掉、請求被取消是正常的流程
        if isinstance(exc, Exception):
            set_attrs(current, {"error.type": type(exc).__name__})
            set_error(current, type(exc).__name__)
        try:
            cm.__exit__(type(exc), exc, exc.__traceback__)
        except Exception:  # noqa: BLE001
            log.warning("span %s 結束時出錯", name, exc_info=True)
        raise
    else:
        try:
            cm.__exit__(None, None, None)
        except Exception:  # noqa: BLE001
            log.warning("span %s 結束時出錯", name, exc_info=True)


def start_span(
    name: str, attributes: Mapping[str, Any] | None = None, parent: Any = None
) -> tuple[Span, otel_context.Context | None]:
    """開一個 span 但不設成目前的 span，回傳 (span, 以它為 parent 的 context)；要自己 `end_span`。

    給 async generator 用：generator 每次 yield 都會回到呼叫端，不適合把 span 掛在 context 上。
    """
    if _provider is None:
        return _INVALID, None
    try:
        # 這個 span 被當成 context manager 用時，SDK 也會自動記例外訊息；和 span() 一樣關掉
        sp = tracer().start_span(
            name,
            context=parent,
            attributes=_clean(attributes),
            record_exception=False,
            set_status_on_exception=False,
        )
        return sp, trace.set_span_in_context(sp, parent)
    except Exception:  # noqa: BLE001
        log.warning("span %s 開不起來，這段不追蹤", name, exc_info=True)
        return _INVALID, None


def end_span(span: Span) -> None:
    try:
        span.end()
    except Exception:  # noqa: BLE001
        log.warning("span 結束時出錯", exc_info=True)


def inject() -> dict[str, str]:
    """把目前的 trace context 轉成 W3C traceparent，放進 RQ job 的 meta。關閉時是空的。"""
    carrier: dict[str, str] = {}
    if _provider is None:
        return carrier
    try:
        propagate.inject(carrier)
    except Exception:  # noqa: BLE001
        log.warning("trace context 轉不出去", exc_info=True)
    return carrier


def extract(carrier: Mapping[str, str] | None) -> otel_context.Context | None:
    if not carrier or _provider is None:
        return None
    try:
        return propagate.extract(dict(carrier))
    except Exception:  # noqa: BLE001
        log.warning("trace context 讀不出來", exc_info=True)
        return None


def capture() -> otel_context.Context | None:
    """記下目前的 context，給之後在別的地方（例如 SSE 的 generator）當 parent。"""
    if _provider is None:
        return None
    try:
        return otel_context.get_current()
    except Exception:  # noqa: BLE001
        return None
