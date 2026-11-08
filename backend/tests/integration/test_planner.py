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
    assert r.keys("tdx:route:v1mock:*")
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


def test_unparseable_hours_are_planned_but_marked_unverified(session, engine, r):
    # 看不懂的營業時間：照樣排，但標成未確認（2026-10-20 決定）
    result, _ = run(session, r, request(session))
    assert all(p["restaurant"]["hours_verified"] for p in result["plans"])

    session.execute(
        text(
            "UPDATE restaurants SET osm_opening_hours = 'Mo-Fr 11:00-21:00 || PH off' "
            "WHERE area_id = (SELECT id FROM areas WHERE code = 'taoyuan')"
        )
    )
    session.commit()
    try:
        result, _ = run(session, r, request(session))
        data = PlanResult.model_validate(result).to_json()
        assert data["plans"]
        for plan in data["plans"]:
            assert plan["restaurant"]["hours_verified"] is False
            assert plan["restaurant"]["last_order"] is None
    finally:
        reseed(engine, DAY)


def test_open_24_hours_is_verified_without_last_order(session, engine, r):
    # 24 小時營業：營業時間有核對過，只是沒有最後點餐（2026-10-24）
    session.execute(
        text(
            "UPDATE restaurants SET osm_opening_hours = '24/7' "
            "WHERE area_id = (SELECT id FROM areas WHERE code = 'taoyuan')"
        )
    )
    session.commit()
    try:
        result, _ = run(session, r, request(session))
        data = PlanResult.model_validate(result).to_json()
        assert data["plans"]
        for plan in data["plans"]:
            assert plan["restaurant"]["hours_verified"] is True
            assert plan["restaurant"]["last_order"] is None
    finally:
        reseed(engine, DAY)


def test_estimated_fares_are_flagged(session, r):
    class EstimatedFares(MockTransit):
        def route(self, origin, dest, at, mode, top=1):
            from dataclasses import replace as dc_replace

            return [
                dc_replace(x, fare_estimated=True)
                for x in super().route(origin, dest, at, mode, top)
            ]

    deps = Deps(
        session=session, redis=r, transit=EstimatedFares(), jev=MockJev(), llm=MockLlm(),
        places=MockPlaces(), settings=Settings(_env_file=None, tdx_per_minute=1000),
    )  # fmt: skip
    result = run_plan(request(session), "job-test", deps, lambda *a, **k: None)
    plans = PlanResult.model_validate(result).to_json()["plans"]
    assert plans[0]["estimated"] == ["ticket", "meal", "fare_go", "fare_return"]
    # 模擬版和真的 TDX 的路線快取分開存
    assert r.keys("tdx:route:v1mock:*") and not r.keys("tdx:route:v3:*")


def test_google_restaurants_replace_others_in_the_same_area(session, r):
    # 同一家店可能同時在 Google 和 OSM（或示意資料）出現：商圈裡有 Google 的店就只用 Google
    from app.planner import Planner

    session.execute(
        text(
            "INSERT INTO restaurants (source, external_id, geom, area_id, category_code, "
            "price_range, meal_duration, date_suitability, is_active) "
            "SELECT 'google', 'ChIJtest', 'SRID=4326;POINT(121.3115 24.9920)', id, 'japanese', "
            "'200_500', 'normal', 2, true FROM areas WHERE code = 'taoyuan'"
        )
    )
    session.commit()
    try:
        deps = Deps(
            session=session, redis=r, transit=MockTransit(), jev=MockJev(), llm=MockLlm(),
            places=MockPlaces(), settings=Settings(_env_file=None, tdx_per_minute=1000),
        )  # fmt: skip
        planner = Planner(request(session), "job-test", deps, lambda *a, **k: None)
        planner._load()
        assert {row.source for row in planner.restaurant_rows.values()} == {"google"}
        # Google 規劃用的額度用完：改用其他來源
        add_usage(r, "google:details_enterprise", 950)
        planner = Planner(request(session), "job-test", deps, lambda *a, **k: None)
        planner._load()
        assert "google" not in {row.source for row in planner.restaurant_rows.values()}
    finally:
        session.execute(text("DELETE FROM restaurants WHERE external_id = 'ChIJtest'"))
        session.commit()


def test_google_quota_not_enough_for_a_whole_plan_uses_osm(session, r):
    # 剩下的額度不夠一次規劃查完（3 個方案 ＋ 重試輪數，預設最多 10 家）：一開始就改用 OSM，
    # 不會查到一半額度用完、剩下的 Google 店全部刷掉變成 NO_FEASIBLE（2026-10-24）
    session.execute(
        text(
            "INSERT INTO restaurants (source, external_id, geom, area_id, category_code, "
            "price_range, meal_duration, date_suitability, is_active) "
            "SELECT 'google', 'ChIJtest', 'SRID=4326;POINT(121.3115 24.9920)', id, 'japanese', "
            "'200_500', 'normal', 2, true FROM areas WHERE code = 'taoyuan'"
        )
    )
    session.commit()
    try:
        add_usage(r, "google:details_enterprise", 945)
        places = HoursPlaces()
        deps = Deps(
            session=session, redis=r, transit=MockTransit(), jev=MockJev(), llm=MockLlm(),
            places=places, settings=Settings(_env_file=None, tdx_per_minute=1000),
        )  # fmt: skip
        result = run_plan(request(session), "job-test", deps, lambda *a, **k: None)
        data = PlanResult.model_validate(result).to_json()
        assert data["restaurant_source"] == "osm"
        assert data["plans"] and all(p["restaurant"]["source"] != "google" for p in data["plans"])
        assert places.calls == {}
    finally:
        session.execute(text("DELETE FROM restaurants WHERE external_id = 'ChIJtest'"))
        session.commit()


class HoursPlaces(MockPlaces):
    """ChIJearly 18:00 就打烊（晚上排不進去），ChIJlate 開到半夜。記下每家查了幾次。"""

    def __init__(self):
        self.calls: dict[str, int] = {}

    def details(self, place_id):
        from app.places import PlaceDetails
        from app.planning.opening_hours import OpeningHours

        self.calls[place_id] = self.calls.get(place_id, 0) + 1
        close = 18 * 60 if place_id == "ChIJearly" else 24 * 60
        hours = OpeningHours(by_weekday=tuple(((11 * 60, close),) for _ in range(7)))
        return PlaceDetails(name=place_id, address="桃園市", hours=hours, price_range="200_500")


def test_google_hours_are_remembered_and_plans_differ(session, r):
    # 步驟 5：查過營業時間的店，這次規劃不再重查，也直接跳過它其他接不上的組合；
    # 三個方案不會是同一家餐廳、同一個開演時間（2026-10-21 決定）
    session.execute(
        text(
            "INSERT INTO restaurants (source, external_id, geom, area_id, category_code, "
            "price_range, meal_duration, date_suitability, is_active) "
            "SELECT 'google', x.pid, 'SRID=4326;POINT(121.3115 24.9920)', a.id, 'japanese', "
            "'200_500', 'normal', 2, true FROM areas a, "
            "(VALUES ('ChIJearly'), ('ChIJlate')) AS x(pid) WHERE a.code = 'taoyuan'"
        )
    )
    session.commit()
    try:
        places = HoursPlaces()
        deps = Deps(
            session=session, redis=r, transit=MockTransit(), jev=MockJev(), llm=MockLlm(),
            places=places, settings=Settings(_env_file=None, tdx_per_minute=1000),
        )  # fmt: skip
        try:
            req = request(session, earliest_departure="15:00", latest_home="23:59")
            result = run_plan(req, "job-test", deps, lambda *a, **k: None)
        except PlanError as e:
            raise AssertionError(e.reasons) from e
        plans = PlanResult.model_validate(result).to_json()["plans"]
        assert plans and all(p["restaurant"]["name"] == "ChIJlate" for p in plans)
        assert places.calls.get("ChIJearly", 0) <= 1 and places.calls["ChIJlate"] == 1
        # 查到接不上的店不會出現在「換一家」
        alts = plans[0].get("alternatives", {}).get("restaurant", [])
        assert "ChIJearly" not in {a["name"] for a in alts}
        keys = [(p["restaurant"]["id"], p["timeline"][2]["starts_at"]) for p in plans]
        assert len(set(keys)) == len(keys)
    finally:
        session.execute(
            text("DELETE FROM restaurants WHERE external_id IN ('ChIJearly', 'ChIJlate')")
        )
        session.commit()


class GonePlaces(HoursPlaces):
    """ChIJgone 歇業或 place ID 變了：Google 回 404。"""

    def details(self, place_id):
        from app.places import PlacesError

        if place_id == "ChIJgone":
            self.calls[place_id] = self.calls.get(place_id, 0) + 1
            raise PlacesError("Google HTTP 404")
        return super().details(place_id)

    def basic(self, place_id):
        from app.places import PlacesError

        if place_id == "ChIJgone":
            raise PlacesError("Google HTTP 404")
        return super().basic(place_id)


def test_google_lookup_failure_skips_that_restaurant(session, r):
    # 一家店查不到，跳過這家換下一家，不是整個規劃失敗（2026-10-24 使用者決定）。
    # ChIJgone 適合約會的分數比較高，一定排在前面先查
    session.execute(
        text(
            "INSERT INTO restaurants (source, external_id, geom, area_id, category_code, "
            "price_range, meal_duration, date_suitability, is_active) "
            "SELECT 'google', x.pid, 'SRID=4326;POINT(121.3115 24.9920)', a.id, 'japanese', "
            "'200_500', 'normal', x.s, true FROM areas a, "
            "(VALUES ('ChIJgone', 2), ('ChIJlate', 1)) AS x(pid, s) WHERE a.code = 'taoyuan'"
        )
    )
    session.commit()
    try:
        places = GonePlaces()
        deps = Deps(
            session=session, redis=r, transit=MockTransit(), jev=MockJev(), llm=MockLlm(),
            places=places, settings=Settings(_env_file=None, tdx_per_minute=1000),
        )  # fmt: skip
        req = request(session, earliest_departure="15:00", latest_home="23:59")
        try:
            result = run_plan(req, "job-test", deps, lambda *a, **k: None)
        except PlanError as e:
            raise AssertionError(e.reasons) from e
        plans = PlanResult.model_validate(result).to_json()["plans"]
        assert plans and all(p["restaurant"]["name"] == "ChIJlate" for p in plans)
        # 查失敗的店只查一次，也不會出現在「換一家」
        assert places.calls["ChIJgone"] == 1
        alts = plans[0].get("alternatives", {}).get("restaurant", [])
        gone_id = session.scalar(text("SELECT id FROM restaurants WHERE external_id = 'ChIJgone'"))
        assert gone_id not in {a["id"] for a in alts}
    finally:
        session.execute(
            text("DELETE FROM restaurants WHERE external_id IN ('ChIJgone', 'ChIJlate')")
        )
        session.commit()


def test_plan_from_current_location(session, r):
    # 出發點是目前位置（2026-10-21）：座標取到小數點 3 位，回到同一個位置就算到家
    deps = Deps(
        session=session, redis=r, transit=MockTransit(), jev=MockJev(), llm=MockLlm(),
        places=MockPlaces(), settings=Settings(_env_file=None, tdx_per_minute=1000),
    )  # fmt: skip
    req = request(session, origin_station_id=None, origin_lat=24.95412, origin_lng=121.22578)
    result = run_plan(req, "job-test", deps, lambda *a, **k: None)
    plan = PlanResult.model_validate(result).to_json()["plans"][0]
    first, home = plan["timeline"][0], plan["timeline"][-1]
    assert first["place"] == {"kind": "location", "id": 0, "name": "目前位置",
                              "lat": 24.954, "lng": 121.226, "place_id": None}  # fmt: skip
    assert home["type"] == "home" and home["station"] == "目前位置"
    assert r.keys("tdx:route:v1mock:loc24.954_121.226:*")


def test_plan_from_chosen_location_uses_its_name(session, r):
    # 自選的位置：時間軸上用搜尋結果的名稱（2026-10-21）
    deps = Deps(
        session=session, redis=r, transit=MockTransit(), jev=MockJev(), llm=MockLlm(),
        places=MockPlaces(), settings=Settings(_env_file=None, tdx_per_minute=1000),
    )  # fmt: skip
    req = request(session, origin_station_id=None, origin_lat=24.9576, origin_lng=121.2405,
                  origin_name=" 中原大學 ")  # fmt: skip
    result = run_plan(req, "job-test", deps, lambda *a, **k: None)
    plan = PlanResult.model_validate(result).to_json()["plans"][0]
    assert plan["timeline"][0]["place"]["name"] == "中原大學"
    assert plan["timeline"][-1]["station"] == "中原大學"


def test_short_stay_reports_transit_window(session, r):
    # 18:00 出門、19:30 前到家：在商圈的時間連一部片加一餐都不夠，問題在交通（2026-10-27）
    with pytest.raises(PlanError) as exc:
        run(session, r, request(session, earliest_departure="18:00", latest_home="19:30"))
    assert exc.value.code == "NO_FEASIBLE"
    assert list(exc.value.reasons) == ["transit_window"]
    assert "最晚" in exc.value.message and "至少要" in exc.value.message


def test_no_way_home_reports_transit_window(session, r):
    class NoWayHome(MockTransit):
        def route(self, origin, dest, at, mode, top=1):
            return [] if mode == "arrival" else super().route(origin, dest, at, mode, top)

    deps = Deps(
        session=session, redis=r, transit=NoWayHome(), jev=MockJev(), llm=MockLlm(),
        places=MockPlaces(), settings=Settings(_env_file=None, tdx_per_minute=1000),
    )  # fmt: skip
    with pytest.raises(PlanError) as exc:
        run_plan(request(session), "job-test", deps, lambda *a, **k: None)
    assert list(exc.value.reasons) == ["transit_window"]
    assert "查不到 23:00 前回到出發點的車" in exc.value.message


def test_cinemas_without_restaurants_nearby_say_so(session, engine, r):
    # 影城附近走路到不了任何餐廳（例如桃園新光影城在高鐵站旁，離中壢的餐廳 6 公里）：
    # 放寬時間、預算都沒用，要說清楚是影城離餐廳太遠（2026-10-30 mcp-eval 端到端 N01）
    session.execute(
        text(
            "UPDATE cinemas SET geom = ST_Translate(geom::geometry, 0, 0.03)::geography "
            "WHERE area_id = (SELECT id FROM areas WHERE code = 'taoyuan')"
        )
    )
    session.commit()
    try:
        with pytest.raises(PlanError) as exc:
            run(session, r, request(session))
        assert exc.value.code == "NO_FEASIBLE"
        assert "示意影城 桃園 A" in exc.value.message and "示意影城 桃園 B" in exc.value.message
        assert "走路 12 分鐘內沒有" in exc.value.message
        # 最近的要走 45 分鐘，超過步行上限的最大選項 20：不叫使用者放寬
        assert "最近的一家要走 45 分鐘" in exc.value.message
        assert "都沒有用，建議換片型、換商圈" in exc.value.message
        assert exc.value.reasons.get("walk")  # 前端照樣拿得到原本的計數
    finally:
        reseed(engine, DAY)


def test_cinemas_a_bit_far_suggest_a_longer_walk(session, engine, r):
    # 放寬步行就走得到的，告訴使用者要放寬到幾分鐘
    session.execute(
        text(
            "UPDATE cinemas SET geom = ST_Translate(geom::geometry, 0, 0.012)::geography "
            "WHERE area_id = (SELECT id FROM areas WHERE code = 'taoyuan')"
        )
    )
    session.commit()
    try:
        with pytest.raises(PlanError) as exc:
            run(session, r, request(session, max_walk_minutes=8))
        # 最近的一家約 595 公尺，走 11 分鐘：步行上限的選項裡，12 分鐘是第一個走得到的
        assert "走路 8 分鐘內沒有" in exc.value.message
        assert "最近的一家要走 11 分鐘。建議把步行上限放寬到 12 分鐘" in exc.value.message
    finally:
        reseed(engine, DAY)
