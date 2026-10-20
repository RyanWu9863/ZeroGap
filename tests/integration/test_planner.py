"""完整的規劃流程（規格書 7.1）：示意種子資料 ＋ 模擬版 TDX、Jev、Google。"""

import json
from datetime import date

import pytest
import redis
from sqlalchemy import text

from app.config import Settings
from app.jev.base import ChoiceAnswer, JevResult
from app.jev.mock import MockJev
from app.llm import LlmPick, MockLlm
from app.places import MockPlaces
from app.planner import Deps, PlanError, run_plan
from app.redis_utils.quota import add_usage
from app.schemas import PlanRequest, PlanResult
from app.transit import MockTransit
from tests.integration.conftest import reseed

DAY = date(2026, 10, 22)


@pytest.fixture(scope="module", autouse=True)
def seeded(engine):
    reseed(engine, DAY)


@pytest.fixture
def r(redis_url):
    client = redis.Redis.from_url(redis_url, decode_responses=True)
    client.flushdb()
    yield client
    client.flushdb()


def station_id(session, uid="demo-TRA-zhongli"):
    return session.scalar(text("SELECT id FROM stations WHERE station_uid = :u"), {"u": uid})


def request(session, **overrides):
    body = {
        "area": "taoyuan",
        "origin_station_id": station_id(session),
        "date": DAY.isoformat(),
        "earliest_departure": "17:00",
        "latest_home": "23:00",
        "order": "movie_first",
        "movie_id": None,
        "movie_genre": None,
        "hall_type": None,
        "language": None,
        "cuisine": None,
        "budget_per_person": 1500,
        "max_walk_minutes": 12,
    }
    body.update(overrides)
    return PlanRequest.model_validate(body)


class UnsureJev:
    """每個選項機率都一樣：每一題都沒把握，一定交給 LLM。"""

    def choose(self, questions, state=None):
        return JevResult(
            answers={
                q.id: ChoiceAnswer({o.code: 1 / len(q.options) for o in q.options})
                for q in questions
            },
            model="jev-unsure",
            input_tokens=10,
        )


class SecondPickLlm:
    """總是選第二名，而且有回答（used_llm=True）。"""

    def pick(self, question, probs):
        ranked = sorted(probs, key=lambda k: (-probs[k], k))
        return LlmPick(code=ranked[min(1, len(ranked) - 1)], used_llm=True)

    def is_connected(self):
        return True


def run(session, r, req, jev=None, llm=None):
    stages = []
    deps = Deps(
        session=session,
        redis=r,
        transit=MockTransit(),
        jev=jev or MockJev(),
        llm=llm or MockLlm(),
        places=MockPlaces(),
        settings=Settings(_env_file=None, tdx_per_minute=1000),
    )
    result = run_plan(req, "job-test", deps, lambda stage, **data: stages.append((stage, data)))
    return result, stages


def test_movie_first_end_to_end(session, r):
    result, stages = run(session, r, request(session))
    parsed = PlanResult.model_validate(result)
    data = parsed.to_json()

    assert 1 <= len(data["plans"]) <= 3
    first = data["plans"][0]
    assert first["highlight"]["key"] == "recommended"
    assert [p["rank"] for p in data["plans"]] == list(range(1, len(data["plans"]) + 1))
    assert data["restaurant_source"] == "google"
    assert first["restaurant"]["source"] == "demo"
    assert first["depart_at"].endswith("+08:00")

    # 時間軸：先看電影的關卡位置
    gates = {s["buffer_gate"]: s["type"] for s in first["timeline"] if s["buffer_gate"]}
    assert gates["showtime"] == "walk"
    assert gates["return_trip"] == "walk"
    assert gates["latest_return"] == "home"
    walk_back = next(s for s in first["timeline"] if s["buffer_gate"] == "return_trip")
    assert walk_back["return_window"]["minutes_to_latest"] == walk_back["buffer_minutes"]
    assert first["min_buffer_minutes"] >= 0
    assert first["cost_per_person"]["total"] <= 1500

    order = [s for s, _ in stages]
    for stage in ("loading_data", "checking_feasibility", "filtering", "choosing",
                  "verifying_hours", "routing", "building_result"):  # fmt: skip
        assert stage in order
    assert order.index("filtering") < order.index("choosing") < order.index("building_result")
    filtering = dict(stages)["filtering"]
    assert filtering["combinations"] == data["stats"]["combinations"]
    assert filtering["feasible"] == data["stats"]["feasible"] > 0
    json.dumps(data)  # 可以直接轉成 JSON


def test_meal_first(session, r):
    result, _ = run(session, r, request(session, order="meal_first", earliest_departure="12:00"))
    plan = PlanResult.model_validate(result).to_json()["plans"][0]
    types = [s["type"] for s in plan["timeline"]]
    assert types.index("meal") < types.index("movie")
    movie = next(s for s in plan["timeline"] if s["type"] == "movie")
    assert movie["buffer_gate"] == "return_trip"
    assert movie["return_window"] is not None


def test_late_night_home(session, r):
    # 最晚到家可以跨到隔天；模擬版 TDX 23:50 以後沒車，所以實際上會在午夜前後到家
    result, _ = run(session, r, request(session, earliest_departure="18:00", latest_home="01:30"))
    plans = PlanResult.model_validate(result).plans
    assert all(p.home_at.isoformat() <= "2026-10-23T01:30:00+08:00" for p in plans)


def test_budget_too_low_reports_reasons(session, r):
    with pytest.raises(PlanError) as exc:
        run(session, r, request(session, budget_per_person=100))
    assert exc.value.code == "NO_FEASIBLE"
    assert exc.value.reasons.get("budget", 0) > 0
    assert list(exc.value.reasons) == [
        k for k in ("showtime", "walk", "opening_hours", "last_order", "last_train", "budget")
        if k in exc.value.reasons
    ]  # fmt: skip


def test_empty_day_has_no_showtimes(session, r):
    with pytest.raises(PlanError) as exc:
        run(session, r, request(session, date="2026-10-25"))
    assert exc.value.code == "NO_SHOWTIMES"


def test_specified_movie(session, r):
    first, _ = run(session, r, request(session))
    movie_id = first["plans"][0]["movie"]["id"]
    result, _ = run(session, r, request(session, movie_id=movie_id))
    plans = PlanResult.model_validate(result).plans
    assert all(p.movie.id == movie_id for p in plans)
    assert all(p.probabilities["movie"] == 1.0 for p in plans)


def test_llm_fallback_marks_decided_by_and_alternatives(session, r):
    result, stages = run(session, r, request(session), jev=UnsureJev(), llm=SecondPickLlm())
    data = PlanResult.model_validate(result).to_json()
    first = data["plans"][0]
    assert first["decided_by"]["movie"] == "llm"
    assert first["decided_by"]["restaurant"] == "llm"
    # 路線只剩一條時機率是 1，不會交給 LLM；交給 LLM 的就一定有備選
    for key in ("route_go", "route_return"):
        if first["decided_by"][key] == "llm":
            assert 1 <= len(first["alternatives"][key]) <= 2
    assert "llm" in {p["decided_by"]["route_go"] for p in data["plans"]}
    assert "restaurant" in first["alternatives"] or "movie" in first["alternatives"]
    for alt in first["alternatives"].get("restaurant", []):
        assert alt["estimated"] is True
    assert "llm_fallback" in [s for s, _ in stages]
    # 第二、三名不是 LLM 選的
    for plan in data["plans"][1:]:
        assert plan["decided_by"]["movie"] == "jev"
        assert plan["alternatives"].get("movie") is None


def test_llm_timeout_counts_as_jev_but_keeps_alternatives(session, r):
    # Jev 沒把握、Ollama 也沒回答：記成 jev，但照樣附備選，使用者還是能換（2026-10-20 決定）
    result, _ = run(session, r, request(session), jev=UnsureJev(), llm=MockLlm())
    data = PlanResult.model_validate(result).to_json()
    first = data["plans"][0]
    assert first["decided_by"]["restaurant"] == "jev"
    assert first["decided_by"]["movie"] == "jev"
    # 示意資料裡第一名的電影只接得上一家店，所以只會有電影備選
    assert first["alternatives"]["movie"]
    for alt in first["alternatives"].get("restaurant", []):
        assert alt["restaurant_id"] != first["restaurant"]["id"]
    for plan in data["plans"]:
        assert all(plan["alternatives"].values())  # 沒有空的備選清單
    for plan in data["plans"][1:]:
        assert "restaurant" not in plan["alternatives"]


def test_confident_jev_has_no_alternatives(session, r):
    class SureJev:
        def choose(self, questions, state=None):
            return JevResult(
                answers={
                    q.id: ChoiceAnswer(
                        {o.code: (1.0 if i == 0 else 0.0) for i, o in enumerate(q.options)}
                    )
                    for q in questions
                },
                model="jev-sure",
                input_tokens=10,
            )

    result, _ = run(session, r, request(session), jev=SureJev())
    for plan in PlanResult.model_validate(result).to_json()["plans"]:
        assert plan["alternatives"] == {}


def test_google_quota_used_up_switches_to_osm(session, r):
    add_usage(r, "google:details_enterprise", 950)
    result, _ = run(session, r, request(session))
    assert result["restaurant_source"] == "osm"


def test_jev_quota_used_up_hands_everything_to_llm(session, r):
    add_usage(r, "jev_cost_micro_usd", 1_000_000)
    result, _ = run(session, r, request(session), llm=SecondPickLlm())
    first = PlanResult.model_validate(result).to_json()["plans"][0]
    assert first["decided_by"]["restaurant"] == "llm"


def test_tdx_routes_are_cached(session, r):
    run(session, r, request(session))
    assert r.keys("tdx:route:v1:*")
    calls_before = r.zcard("rl:tdx")
    run(session, r, request(session))
    assert r.zcard("rl:tdx") == calls_before  # 第二次全部命中快取


class NoExactRoutes(MockTransit):
    """步驟 6（top=3）一條都查不到：要退回用步驟 2 的路線。"""

    def route(self, origin, dest, at, mode, top=1):
        return [] if top == 3 else super().route(origin, dest, at, mode, top)


def test_falls_back_to_step2_routes(session, r):
    stages = []
    deps = Deps(
        session=session,
        redis=r,
        transit=NoExactRoutes(),
        jev=MockJev(),
        llm=MockLlm(),
        places=MockPlaces(),
        settings=Settings(_env_file=None, tdx_per_minute=1000),
    )
    result = run_plan(request(session), "job-test", deps, lambda st, **d: stages.append(st))
    data = PlanResult.model_validate(result).to_json()
    assert len(data["plans"]) == 3
    # 只有一條路線可選，機率是 1，不會交給 LLM
    assert all(p["decided_by"]["route_go"] == "jev" for p in data["plans"])
    assert stages.count("verifying_hours") == 1  # 第一批就全部成功，不用換下一組


def test_restaurants_without_jev_attributes_are_skipped(session, r):
    from app.planner import Planner

    ids = session.scalars(
        text(
            "SELECT r.id FROM restaurants r JOIN areas a ON a.id = r.area_id "
            "WHERE a.code = 'taoyuan' ORDER BY r.id LIMIT 2"
        )
    ).all()
    session.execute(text("UPDATE restaurants SET price_range = NULL WHERE id = :i"), {"i": ids[0]})
    session.execute(
        text("UPDATE restaurants SET meal_duration = NULL WHERE id = :i"), {"i": ids[1]}
    )
    session.commit()
    try:
        deps = Deps(
            session=session, redis=r, transit=MockTransit(), jev=MockJev(), llm=MockLlm(),
            places=MockPlaces(), settings=Settings(_env_file=None, tdx_per_minute=1000),
        )  # fmt: skip
        planner = Planner(request(session), "job-test", deps, lambda *a, **k: None)
        planner._load()
        assert ids[0] not in planner.restaurant_rows
        assert ids[1] not in planner.restaurant_rows
        assert len(planner.restaurant_rows) == 13
    finally:
        session.execute(
            text(
                "UPDATE restaurants SET price_range = '200_500', meal_duration = 'normal' "
                "WHERE id = ANY(:ids) AND (price_range IS NULL OR meal_duration IS NULL)"
            ),
            {"ids": list(ids)},
        )
        session.commit()
