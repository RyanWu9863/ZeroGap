"""OpenTelemetry 追蹤（app.tracing）：開啟時的 span 和 attributes、關閉時不產生 span、
attributes 不含 prompt、LLM 逾時的 status、trace context 經過 RQ 的 job meta 傳到 worker、
追蹤自己出錯不影響規劃。全部用 InMemorySpanExporter，不連任何服務。
"""

import asyncio
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
import respx
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode
from pydantic import BaseModel

from app import tracing
from app.config import Settings
from app.jev.base import ChoiceAnswer
from app.jobs import plan_job as plan_job_module
from app.jobs import queue as queue_module
from app.llm import LlmPick, LlmPicker
from app.planner import Planner
from app.planning.choose import ChoiceQuestion, Option, RouterPolicy
from app.services import ApiError

BASE = "http://ollama.test:11434"
SECRET_STATE = {"note": "使用者偏好-不該出現在span"}
QUESTION = ChoiceQuestion(
    id="restaurant",
    instructions="選一家最適合的餐廳-不該出現在span",
    options=[
        Option("r1", "餐廳一號-不該出現", {"cuisine": "japanese"}),
        Option("r2", "餐廳二號-不該出現", {"cuisine": "western"}),
        Option("r3", "餐廳三號-不該出現", {"cuisine": "chinese"}),
    ],
    state=SECRET_STATE,
)
SURE = ChoiceAnswer({"r1": 0.8, "r2": 0.15, "r3": 0.05})
UNSURE = ChoiceAnswer({"r1": 0.4, "r2": 0.35, "r3": 0.25})


@pytest.fixture
def spans():
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    tracing.set_provider(provider)
    yield exporter
    tracing.set_provider(None)


@pytest.fixture(autouse=True)
def tracing_off_after():
    yield
    tracing.set_provider(None)


def bare_planner(llm, job_id: str = "job-otel") -> Planner:
    """和 test_planner_decisions 一樣，不經過 __init__，只放 _decide 用到的欄位。"""
    p = Planner.__new__(Planner)
    p.policy = RouterPolicy()
    p.decisions, p._jev_result, p.job_id = [], None, job_id
    p.progress = lambda stage, **data: None
    p.d = SimpleNamespace(llm=llm)
    return p


def by_name(exporter: InMemorySpanExporter) -> dict:
    return {s.name: s for s in exporter.get_finished_spans()}


def ollama_reply(choice: str) -> httpx.Response:
    return httpx.Response(200, json={"response": json.dumps({"choice": choice}), "done": True})


# ── 開啟：span 和 attributes ─────────────────────────────────


@respx.mock
def test_unsure_decision_produces_decide_and_llm_spans(spans):
    respx.post(f"{BASE}/api/generate").mock(return_value=ollama_reply("r2"))
    p = bare_planner(LlmPicker(BASE, "qwen2.5:3b", timeout=1.0))

    assert p._decide(QUESTION, UNSURE) == ("r2", True)

    got = by_name(spans)
    decide, llm = got["planner.decide"], got["llm.pick"]
    assert llm.parent.span_id == decide.context.span_id
    assert decide.attributes["job_id"] == "job-otel"
    assert decide.attributes["question_id"] == "restaurant"
    assert decide.attributes["router.policy"] == "fixed:0.6"
    assert decide.attributes["router.unsure"] is True
    assert decide.attributes["decided_by"] == "llm"
    assert decide.attributes["llm.status"] == "ok"
    assert "fallback_reason" not in decide.attributes  # None 不放
    assert llm.attributes["llm.status"] == "ok"
    assert llm.attributes["llm.breaker_state"] == "closed"
    assert llm.attributes["llm.model"] == "qwen2.5:3b"
    assert llm.status.status_code == StatusCode.UNSET


def test_sure_decision_has_no_llm_span(spans):
    p = bare_planner(LlmPicker(BASE, "qwen2.5:3b"))
    assert p._decide(QUESTION, SURE) == ("r1", False)
    got = by_name(spans)
    assert set(got) == {"planner.decide"}
    assert got["planner.decide"].attributes["decided_by"] == "jev"
    assert got["planner.decide"].attributes["router.unsure"] is False


def test_job_id_on_span_matches_decision_record(spans):
    p = bare_planner(SimpleNamespace(pick=lambda q, probs: LlmPick("r1", False, "timeout")))
    p._decide(QUESTION, UNSURE)
    [rec] = p.decisions
    decide = by_name(spans)["planner.decide"]
    # decision_records 用的就是 Planner.job_id（_save_decisions）
    assert decide.attributes["job_id"] == p.job_id
    assert decide.attributes["fallback_reason"] == rec.fallback_reason == "llm_timeout"
    assert decide.attributes["decided_by"] == rec.decided_by == "jev"


# ── LLM 逾時、熔斷 ────────────────────────────────────────────


@respx.mock
def test_llm_timeout_span_has_error_status(spans):
    respx.post(f"{BASE}/api/generate").mock(side_effect=httpx.ReadTimeout("slow"))
    p = bare_planner(LlmPicker(BASE, "qwen2.5:3b", timeout=1.0))

    assert p._decide(QUESTION, UNSURE) == ("r1", False)  # 規劃照常：用 Jev 第一名

    got = by_name(spans)
    llm = got["llm.pick"]
    assert llm.attributes["llm.status"] == "timeout"
    assert llm.attributes["llm.used"] is False
    assert llm.status.status_code == StatusCode.ERROR
    assert llm.status.description == "llm timeout"
    assert got["planner.decide"].attributes["fallback_reason"] == "llm_timeout"


@respx.mock
def test_breaker_open_is_recorded(spans):
    respx.post(f"{BASE}/api/generate").mock(side_effect=httpx.ConnectError("down"))
    picker = LlmPicker(BASE, "qwen2.5:3b", timeout=1.0, breaker_failures=1)
    p = bare_planner(picker)
    p._decide(QUESTION, UNSURE)  # 失敗一次就熔斷
    spans.clear()
    p._decide(QUESTION, UNSURE)
    got = by_name(spans)
    assert got["llm.pick"].attributes["llm.breaker_state"] == "open"
    assert got["llm.pick"].attributes["llm.status"] == "circuit_open"
    assert got["planner.decide"].attributes["fallback_reason"] == "llm_circuit_open"


# ── 不放 prompt、使用者輸入 ─────────────────────────────────────


@respx.mock
def test_attributes_do_not_contain_prompt(spans):
    route = respx.post(f"{BASE}/api/generate").mock(return_value=ollama_reply("r2"))
    p = bare_planner(LlmPicker(BASE, "qwen2.5:3b", timeout=1.0))
    p._decide(QUESTION, UNSURE)
    prompt = json.loads(route.calls[0].request.content)["prompt"]

    values = [str(v) for s in spans.get_finished_spans() for v in s.attributes.values()]
    keys = [k for s in spans.get_finished_spans() for k in s.attributes]
    assert values
    assert not any("prompt" in k for k in keys)
    forbidden = [prompt, QUESTION.instructions, SECRET_STATE["note"]]
    forbidden += [o.label for o in QUESTION.options]
    for text in forbidden:
        assert not any(text in v for v in values), text
    assert not any("不該出現" in v for v in values)


# ── 關閉：不產生 span ────────────────────────────────────────


@respx.mock
def test_disabled_produces_no_spans_and_same_result():
    exporter = InMemorySpanExporter()  # 沒有接到任何 provider
    respx.post(f"{BASE}/api/generate").mock(side_effect=httpx.ReadTimeout("slow"))
    p = bare_planner(LlmPicker(BASE, "qwen2.5:3b", timeout=1.0))
    assert not tracing.enabled()
    assert p._decide(QUESTION, UNSURE) == ("r1", False)
    assert exporter.get_finished_spans() == ()
    assert tracing.inject() == {}
    with tracing.span("x") as sp:
        assert not sp.is_recording()


def test_setup_does_nothing_when_disabled():
    tracing.setup_tracing(Settings(_env_file=None, otel_enabled=False), "zerogap-test")
    assert not tracing.enabled()


def test_otel_settings_default_off(monkeypatch):
    monkeypatch.delenv("OTEL_ENABLED", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_ENDPOINT", raising=False)
    s = Settings(_env_file=None)
    assert s.otel_enabled is False
    assert s.otel_exporter_endpoint == "http://localhost:4318/v1/traces"


# ── 經過 RQ：job meta 帶 trace context ─────────────────────────


class FakeQueue:
    count = 0

    def __init__(self):
        self.kwargs: dict = {}

    def enqueue(self, func, *args, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(id=kwargs["job_id"])


def test_enqueue_without_tracing_has_no_meta(monkeypatch):
    q = FakeQueue()
    monkeypatch.setattr(queue_module, "plans_queue", lambda conn: q)
    queue_module.enqueue_plan(None, "job-1", {}, Settings(_env_file=None))
    assert "meta" not in q.kwargs


def fake_job(job_id: str, meta: dict):
    now = datetime(2026, 11, 7, 12, tzinfo=UTC)
    return SimpleNamespace(
        id=job_id, meta=meta, enqueued_at=now, started_at=now + timedelta(milliseconds=250)
    )


def run_plan_job(monkeypatch, job, run_plan):
    published: list = []

    class FakeSession:
        def __enter__(self):
            return None

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(plan_job_module, "get_current_job", lambda: job)
    monkeypatch.setattr(
        plan_job_module,
        "sync_redis",
        lambda: SimpleNamespace(publish=lambda ch, msg: published.append(json.loads(msg))),
    )
    monkeypatch.setattr(plan_job_module, "sync_session", lambda: FakeSession)
    for name in ("make_transit", "make_jev", "make_llm", "make_places"):
        monkeypatch.setattr(plan_job_module, name, lambda *a, **k: None)
    monkeypatch.setattr(plan_job_module, "run_plan", run_plan)
    monkeypatch.setattr(plan_job_module.PlanRequest, "model_validate", lambda body: body)
    plan_job_module.plan_job({})
    return published


def test_trace_context_crosses_rq_to_worker(spans, monkeypatch):
    q = FakeQueue()
    monkeypatch.setattr(queue_module, "plans_queue", lambda conn: q)
    with tracing.span("plan.enqueue", {"job_id": "job-rq"}):
        queue_module.enqueue_plan(None, "job-rq", {}, Settings(_env_file=None))
    meta = q.kwargs["meta"]
    assert "traceparent" in meta[queue_module.TRACE_META]

    def run_plan(req, job_id, deps, progress):
        with tracing.span("planner.load", {"job_id": job_id}):
            pass
        raise plan_job_module.PlanError("NO_FEASIBLE", "排不出來", {})

    published = run_plan_job(monkeypatch, fake_job("job-rq", meta), run_plan)
    assert published[-1]["event"] == "error"  # 規劃結果照常推送

    got = by_name(spans)
    enqueue, job, load = got["plan.enqueue"], got["plan_job"], got["planner.load"]
    assert job.context.trace_id == enqueue.context.trace_id
    assert job.parent.span_id == enqueue.context.span_id
    assert load.parent.span_id == job.context.span_id
    assert job.attributes["job_id"] == "job-rq"
    assert job.attributes["rq.queue_wait_ms"] == 250.0
    assert job.attributes["plan.outcome"] == "error"
    assert job.attributes["plan.error_code"] == "NO_FEASIBLE"
    assert job.status.status_code == StatusCode.ERROR


def test_worker_without_meta_starts_own_trace(spans, monkeypatch):
    run_plan_job(monkeypatch, fake_job("job-x", {}), lambda *a: {"plans": []})
    job = by_name(spans)["plan_job"]
    assert job.parent is None
    assert job.attributes["job_id"] == "job-x"


# ── 追蹤自己出錯不影響規劃 ────────────────────────────────────


class BrokenProvider:
    def get_tracer(self, *args, **kwargs):
        raise RuntimeError("tracer broken")

    def force_flush(self, *args):
        raise RuntimeError("flush broken")


def test_broken_tracing_does_not_break_decide(caplog):
    tracing.set_provider(BrokenProvider())
    p = bare_planner(SimpleNamespace(pick=lambda q, probs: LlmPick("r2", True, "ok")))
    assert p._decide(QUESTION, UNSURE) == ("r2", True)
    assert len(p.decisions) == 1
    tracing.flush()  # 只記警告
    assert "tracer" in caplog.text or "取不到 tracer" in caplog.text


def test_broken_span_attributes_only_warn(spans, monkeypatch, caplog):
    def boom(self, attrs):
        raise RuntimeError("attrs broken")

    from opentelemetry.sdk.trace import Span

    monkeypatch.setattr(Span, "set_attributes", boom)
    p = bare_planner(SimpleNamespace(pick=lambda q, probs: LlmPick("r2", True, "ok")))
    assert p._decide(QUESTION, UNSURE) == ("r2", True)
    assert "span attributes 寫不進去" in caplog.text


def test_exception_inside_span_still_propagates(spans):
    with pytest.raises(ValueError), tracing.span("boom"):
        raise ValueError("planner error")
    [sp] = spans.get_finished_spans()
    assert sp.status.status_code == StatusCode.ERROR


# ── 例外只記類別名稱，不記訊息（訊息可能含使用者輸入） ─────────────────

MARK = "LEAK7Q使用者輸入"


class Form(BaseModel):
    budget_per_person: int


def raise_validation_error():
    # pydantic 的訊息會帶輸入值：input_value='LEAK7Q使用者輸入'
    Form.model_validate({"budget_per_person": MARK})


def raise_api_error():
    # services.validate_plan 的訊息會帶使用者給的商圈代碼（api.py 的 plan.request 包住它）
    raise ApiError(404, "NOT_FOUND", f"商圈 {MARK} 不存在或沒有開放")


def span_texts(sp) -> list[str]:
    """span 上會送出去的文字：attributes、events（含 event 的 attributes）、status 說明。"""
    texts = [str(v) for v in sp.attributes.values()]
    for event in sp.events:
        texts += [event.name, *(str(v) for v in event.attributes.values())]
    texts.append(sp.status.description or "")
    return texts


@pytest.mark.parametrize(
    ("raise_it", "error_type"),
    [(raise_validation_error, "ValidationError"), (raise_api_error, "ApiError")],
)
def test_exception_message_is_not_recorded(spans, raise_it, error_type):
    # 原例外照常往外丟，訊息不變
    with pytest.raises(Exception, match=MARK) as info:
        with tracing.span("outer"), tracing.span("inner"):
            raise_it()
    assert type(info.value).__name__ == error_type

    got = spans.get_finished_spans()
    assert {sp.name for sp in got} == {"outer", "inner"}  # 例外經過的外層也一樣
    for sp in got:
        assert not any(MARK in text for text in span_texts(sp)), sp.name
        assert [event.name for event in sp.events] == []
        assert sp.status.status_code == StatusCode.ERROR
        assert sp.status.description == error_type
        assert sp.attributes["error.type"] == error_type


def test_start_span_does_not_record_exception_message(spans):
    # start_span 的 span 平常用 end_span 結束；就算被當成 context manager 用，也不記訊息
    sp, _ = tracing.start_span("manual")
    with pytest.raises(ValueError, match=MARK), sp:
        raise ValueError(f"輸入 {MARK}")
    [got] = spans.get_finished_spans()
    assert not any(MARK in text for text in span_texts(got))


def test_generator_exit_is_not_an_error(spans):
    """消費端提早關掉 generator 是正常的流程，不標錯誤。"""

    def stream():
        with tracing.span("stream"):
            yield 1
            yield 2

    g = stream()
    assert next(g) == 1
    g.close()  # GeneratorExit 從 with 裡面丟出來
    [sp] = spans.get_finished_spans()
    assert sp.status.status_code == StatusCode.UNSET
    assert "error.type" not in sp.attributes
    assert [event.name for event in sp.events] == []


async def test_cancelled_is_not_an_error(spans):
    """請求被取消（使用者斷線、MCP 客戶端取消）是正常的流程，不標錯誤。"""
    started = asyncio.Event()

    async def wait_forever():
        with tracing.span("waiting"):
            started.set()
            await asyncio.Event().wait()

    task = asyncio.create_task(wait_forever())
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    [sp] = spans.get_finished_spans()
    assert sp.status.status_code == StatusCode.UNSET
    assert "error.type" not in sp.attributes
    assert [event.name for event in sp.events] == []


def test_broken_error_status_only_warns(spans, monkeypatch, caplog):
    def boom(self, *args, **kwargs):
        raise RuntimeError("status broken")

    from opentelemetry.sdk.trace import Span

    monkeypatch.setattr(Span, "set_status", boom)
    with pytest.raises(ValueError, match="planner error"), tracing.span("boom"):
        raise ValueError("planner error")
    assert "span status 寫不進去" in caplog.text
    [sp] = spans.get_finished_spans()
    assert sp.attributes["error.type"] == "ValueError"
