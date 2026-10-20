"""規劃流程的指揮（規格書 7.1）：讀資料 → 7 個步驟 → 結果。

純邏輯都在 `app.planning`；這裡負責讀資料庫、呼叫外部服務、推送進度。
每個步驟開始時呼叫 `progress(stage, **data)`，由 RQ 工作轉成 Pub/Sub 事件。
"""

import math
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import redis
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings
from app.jev.base import ChoiceAnswer, Jev
from app.labels import HALL_TYPE_LABELS
from app.llm import Llm
from app.places import PlaceDetails, Places
from app.planning import choose
from app.planning.alternatives import movie_alternatives, restaurant_alternatives
from app.planning.choose import (
    ChoiceQuestion,
    MovieInfo,
    Ranked,
    RestaurantInfo,
    build_movie_question,
    build_restaurant_question,
    build_route_question,
)
from app.planning.feasibility import FilterResult, check, filter_all
from app.planning.highlights import PlanMetrics, assign_highlights
from app.planning.opening_hours import OpeningHours
from app.planning.rules import estimate_ticket, meal_cost, walk_minutes
from app.planning.timeline import Timeline, TimelinePlaces, build_timeline
from app.planning.types import Combo, Conditions, Leg, Place, Rejected, Restaurant, Route, Showtime
from app.queries import cinema_restaurant_meters, nearest_hubs
from app.redis_utils.cache import CachedTransit
from app.redis_utils.quota import add_usage, has_room, jev_cost_micro_usd
from app.redis_utils.ratelimit import wait_for_slot
from app.schemas import PlanRequest
from app.transit import Endpoint, Transit

TZ = ZoneInfo("Asia/Taipei")
Progress = Callable[..., None]
PLANS_WANTED = 3


class PlanError(Exception):
    def __init__(self, code: str, message: str, reasons: dict[str, int] | None = None):
        super().__init__(message)
        self.code, self.message, self.reasons = code, message, reasons


@dataclass
class Deps:
    session: Session
    redis: redis.Redis
    transit: Transit  # 還沒包快取的 TDX（或模擬版）
    jev: Jev
    llm: Llm
    places: Places
    settings: Settings


@dataclass
class _RestaurantRow:
    id: int
    source: str
    external_id: str
    cuisine: str | None
    date_suitability: int | None
    meal_duration: str | None
    price_range: str | None
    name: str | None
    lat: float
    lng: float


@dataclass
class _Candidate:
    ranked: Ranked
    combo: Combo  # 步驟 5 補上營業時間後重算過的
    name: str | None
    address: str | None
    go: list[Route] | None = None
    ret: list[Route] | None = None


class Planner:
    def __init__(self, req: PlanRequest, job_id: str, deps: Deps, progress: Progress):
        self.req, self.job_id, self.d, self.progress = req, job_id, deps, progress
        self.s = deps.settings
        self.transit = CachedTransit(
            deps.transit,
            deps.redis,
            before_call=self._wait_tdx,
            version="v1" if self.s.tdx_mode == "real" else "v1mock",
        )
        self.earliest, self.latest_home = req.resolved_times()
        self.cond = Conditions(
            order=req.order,
            earliest_departure=self.earliest,
            latest_home=self.latest_home,
            max_walk_minutes=req.max_walk_minutes,
            budget_per_person=req.budget_per_person,
            arrive_before_showtime=self.s.arrive_before_showtime_minutes,
            wait_minutes=self.s.wait_minutes,
            last_order_before_close=self.s.last_order_before_close_minutes,
            max_wait_for_opening=self.s.max_wait_for_opening_minutes,
        )

    # ── 外部服務的限流與額度 ──────────────────────────────────────

    def _wait(self, key: str, limit: int, service: str) -> None:
        def on_wait(ms: int) -> None:
            self.progress("waiting_quota", service=service, wait_seconds=math.ceil(ms / 1000))

        wait_for_slot(self.d.redis, key, limit, 60_000, on_wait=on_wait)

    def _wait_tdx(self) -> None:
        self._wait("rl:tdx", self.s.tdx_per_minute, "tdx")

    def _ask_jev(self, questions: list[ChoiceQuestion]) -> dict[str, ChoiceAnswer]:
        questions = [q for q in questions if q.options]
        if not questions:
            return {}
        if not has_room(self.d.redis, "jev_cost_micro_usd", self.s.quota_jev_cost_micro_usd):
            # 每月費用用完：全部交給 LLM（3、5.5），機率都一樣
            return {
                q.id: ChoiceAnswer({o.code: 1 / len(q.options) for o in q.options})
                for q in questions
            }
        self._wait("rl:jev", self.s.jev_per_minute, "jev")
        result = self.d.jev.choose(questions)
        add_usage(self.d.redis, "jev_cost_micro_usd", jev_cost_micro_usd(result.input_tokens))
        return result.answers

    def _decide(self, question: ChoiceQuestion, answer: ChoiceAnswer) -> tuple[str, bool]:
        """回傳 (選中的代碼, 是否由 LLM 決定)。"""
        probs = answer.probabilities
        if not choose.needs_llm(probs, self.s.jev_min_top_probability):
            return answer.top, False
        self.progress("llm_fallback", question=question.id)
        pick = self.d.llm.pick(question, probs)
        return pick.code, pick.used_llm

    @property
    def restaurant_source(self) -> str:
        """Google 規劃用的額度用完就改用 OSM（5.5）。"""
        ok = has_room(
            self.d.redis, "google:details_enterprise", self.s.quota_google_details_enterprise
        )
        return "google" if ok else "osm"

    # ── 主流程 ───────────────────────────────────────────────

    def run(self) -> dict[str, Any]:
        self.progress("loading_data")
        self._load()
        self.progress("checking_feasibility")
        reach, leave = self._feasible_times()
        result = filter_all(self.showtimes, self.restaurants, self.walk, reach, leave, self.cond)
        self.progress("filtering", combinations=result.combinations, feasible=result.feasible_count)
        if not result.feasible:
            raise PlanError(
                "NO_FEASIBLE", "沒有接得上的組合，可以放寬時間、預算或步行距離", result.reasons
            )
        self.reach, self.leave = reach, leave

        self.progress("choosing")
        ranked, picks = self._choose(result)
        plans = self._verify_and_route(ranked)
        if not plans:
            raise PlanError("NO_FEASIBLE", "查到的精確路線都接不上，請放寬時間再試一次", {})

        self.progress("building_result")
        return self._build_result(result, plans, picks)

    # ── 步驟 1：讀取資料 ─────────────────────────────────────────

    def _load(self) -> None:
        q = self.d.session.execute
        req = self.req
        area = q(
            text("SELECT id, name FROM areas WHERE code = :c AND is_open"), {"c": req.area}
        ).first()
        if area is None:
            raise PlanError("NOT_FOUND", "商圈不存在或沒有開放")
        self.area_id = area.id
        st = q(
            text(
                "SELECT id, name, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lng "
                "FROM stations WHERE id = :i AND is_active"
            ),
            {"i": req.origin_station_id},
        ).first()
        if st is None:
            raise PlanError("NOT_FOUND", "出發站不存在")
        self.station = Place(kind="station", id=st.id, name=st.name, lat=st.lat, lng=st.lng)
        self.station_ep = Endpoint(f"sta{st.id}", "station", st.name, st.lat, st.lng, rail=True)

        self.hubs: dict[int, Place] = {}
        self.hub_eps: dict[int, Endpoint] = {}
        for h in q(
            text(
                "SELECT id, name, ST_Y(geom::geometry) lat, ST_X(geom::geometry) lng "
                "FROM area_hubs WHERE area_id = :a AND geom IS NOT NULL"
            ),
            {"a": self.area_id},
        ):
            self.hubs[h.id] = Place(kind="hub", id=h.id, name=h.name, lat=h.lat, lng=h.lng)
            self.hub_eps[h.id] = Endpoint(
                f"hub{h.id}", "hub", h.name, h.lat, h.lng, rail=h.name.endswith("站")
            )

        self.labels: dict[str, dict[str, str]] = {"movie_genre": {}, "cuisine": {}}
        for kind, code, label in q(text("SELECT kind, code, label FROM categories")):
            self.labels.setdefault(kind, {})[code] = label
        prices = {
            (c, h): (lo, hi)
            for c, h, lo, hi in q(
                text("SELECT chain, hall_type, price_low, price_high FROM ticket_prices")
            )
        }

        self._load_showtimes(prices)
        self._load_restaurants()

    def _load_showtimes(self, prices) -> None:
        req = self.req
        day_start = datetime.combine(req.date, time(0), TZ)
        where = [
            "c.area_id = :area",
            "c.is_active",
            "c.geom IS NOT NULL",
            "s.starts_at >= :day_start",
            "s.starts_at < :day_end",
        ]
        params: dict[str, Any] = {
            "area": self.area_id,
            "day_start": day_start,
            "day_end": day_start + timedelta(days=1),
        }
        for column, value in (
            ("s.movie_id", req.movie_id),
            ("m.genre_code", req.movie_genre),
            ("s.hall_type", req.hall_type),
            ("s.language", req.language),
        ):
            if value is not None:
                name = column.split(".")[1]
                where.append(f"{column} = :{name}")
                params[name] = value
        rows = self.d.session.execute(
            text(
                f"""
                SELECT s.id, s.movie_id, s.cinema_id, s.starts_at, s.ends_at, s.hall_type,
                       s.language, c.name AS cinema_name, c.chain,
                       ST_Y(c.geom::geometry) AS lat, ST_X(c.geom::geometry) AS lng,
                       m.title, m.genre_code, m.runtime_min, m.rating
                FROM showtimes s
                JOIN cinemas c ON c.id = s.cinema_id
                JOIN movies m ON m.id = s.movie_id
                WHERE {" AND ".join(where)}
                ORDER BY s.starts_at, s.id
                """
            ),
            params,
        ).all()
        if not rows:
            raise PlanError("NO_SHOWTIMES", "這一天沒有符合條件的場次")

        self.showtimes: list[Showtime] = []
        self.showtime_rows: dict[int, Any] = {}
        self.movies: dict[int, MovieInfo] = {}
        self.cinemas: dict[int, Place] = {}
        self.cinema_eps: dict[int, Endpoint] = {}
        self.cinema_chain: dict[int, str | None] = {}
        for r in rows:
            self.showtimes.append(
                Showtime(
                    id=r.id,
                    movie_id=r.movie_id,
                    cinema_id=r.cinema_id,
                    starts_at=r.starts_at.astimezone(TZ),
                    ends_at=r.ends_at.astimezone(TZ),
                    ticket=estimate_ticket(r.chain, r.hall_type, prices, self.s.ticket_round_to),
                    hall_type=r.hall_type,
                    language=r.language,
                )
            )
            self.showtime_rows[r.id] = r
            self.movies[r.movie_id] = MovieInfo(
                id=r.movie_id,
                title=r.title,
                genre=r.genre_code,
                runtime_min=r.runtime_min,
                rating=r.rating,
            )
            self.cinemas[r.cinema_id] = Place(
                kind="cinema", id=r.cinema_id, name=r.cinema_name, lat=r.lat, lng=r.lng
            )
            self.cinema_eps[r.cinema_id] = Endpoint(
                f"cin{r.cinema_id}", "cinema", r.cinema_name, r.lat, r.lng
            )
            self.cinema_chain[r.cinema_id] = r.chain

    def _load_restaurants(self) -> None:
        # Jev 還沒判斷出價位或用餐時間的店不排：預算和時間會算錯（2026-10-20 決定）
        where = [
            "area_id = :area",
            "is_active",
            "geom IS NOT NULL",
            "price_range IS NOT NULL",
            "meal_duration IS NOT NULL",
        ]
        params: dict[str, Any] = {"area": self.area_id}
        if self.req.cuisine is not None:
            where.append("category_code = :cuisine")
            params["cuisine"] = self.req.cuisine
        if self.restaurant_source == "osm":
            where.append("source <> 'google'")
        rows = self.d.session.execute(
            text(
                f"""
                SELECT id, source, external_id, category_code, date_suitability, meal_duration,
                       price_range, osm_name, osm_opening_hours,
                       ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng
                FROM restaurants WHERE {" AND ".join(where)} ORDER BY id
                """
            ),
            params,
        ).all()
        hubs = nearest_hubs(self.d.session, self.area_id)
        meters = cinema_restaurant_meters(self.d.session, self.area_id)

        self.restaurants: list[Restaurant] = []
        self.restaurant_rows: dict[int, _RestaurantRow] = {}
        for r in rows:
            if r.id not in hubs or hubs[r.id][0] not in self.hubs:
                continue
            hub_id, hub_meters = hubs[r.id]
            duration = r.meal_duration
            self.restaurants.append(
                Restaurant(
                    id=r.id,
                    hub_id=hub_id,
                    walk_to_hub=self._walk(hub_meters),
                    meal_minutes=self.s.meal_minutes[duration],
                    meal_cost=meal_cost(r.price_range, self.s.meal_cost_by_price_range),
                    # Google 的營業時間不能存，要到步驟 5 才知道
                    hours=None if r.source == "google" else OpeningHours.parse(r.osm_opening_hours),
                    meal_duration=duration,
                )
            )
            self.restaurant_rows[r.id] = _RestaurantRow(
                id=r.id,
                source=r.source,
                external_id=r.external_id,
                cuisine=r.category_code,
                date_suitability=r.date_suitability,
                meal_duration=r.meal_duration,
                price_range=r.price_range,
                name=None if r.source == "google" else r.osm_name,
                lat=r.lat,
                lng=r.lng,
            )
        if not self.restaurants:
            raise PlanError("NO_FEASIBLE", "這個商圈沒有符合條件的餐廳", {})
        self.walk = {
            (cid, rid): self._walk(m)
            for (cid, rid), m in meters.items()
            if cid in self.cinemas and rid in self.restaurant_rows
        }

    def _walk(self, meters: float) -> int:
        return walk_minutes(meters, self.s.walk_detour_factor, self.s.walk_meters_per_minute)

    # ── 步驟 2：查 TDX 求可行時間 ─────────────────────────────────

    def _feasible_times(self):
        reach: dict = {}
        leave: dict = {}
        # 步驟 2 查到的路線留著：步驟 6 查不到合用的路線時退回用它，不必多呼叫 TDX
        self.step2_go: dict = {}
        self.step2_ret: dict = {}
        cinema_ids = sorted({s.cinema_id for s in self.showtimes})
        hub_ids = sorted({r.hub_id for r in self.restaurants})
        if self.req.order == "movie_first":
            go_targets = [("cinema", c, self.cinema_eps[c]) for c in cinema_ids]
            back_from = [("hub", h, self.hub_eps[h]) for h in hub_ids]
        else:
            go_targets = [("hub", h, self.hub_eps[h]) for h in hub_ids]
            back_from = [("cinema", c, self.cinema_eps[c]) for c in cinema_ids]
        for kind, pid, ep in go_targets:
            routes = self.transit.route(self.station_ep, ep, self.earliest, "depart")
            if routes:
                r = routes[0]
                reach[(kind, pid)] = Leg(at=r.reach_at, fare=r.fare, ride_minutes=r.ride_minutes)
                self.step2_go[(kind, pid)] = r
        for kind, pid, ep in back_from:
            routes = self.transit.route(ep, self.station_ep, self.latest_home, "arrival")
            if routes:
                r = routes[0]
                leave[(kind, pid)] = Leg(at=r.leave_at, fare=r.fare, ride_minutes=r.ride_minutes)
                self.step2_ret[(kind, pid)] = r
        return reach, leave

    # ── 步驟 4：Jev 做選擇 ─────────────────────────────────────

    def _choose(self, result: FilterResult):
        prefs = self.req.model_dump()
        rinfo = {
            rid: RestaurantInfo(
                id=rid,
                cuisine=row.cuisine,
                date_suitability=row.date_suitability,
                price_range=row.price_range,
                meal_duration=row.meal_duration,
            )
            for rid, row in self.restaurant_rows.items()
        }
        questions = [build_restaurant_question(result, rinfo, prefs, self.s.jev_max_options)]
        if self.req.movie_id is None:
            questions.insert(
                0, build_movie_question(result, self.movies, prefs, self.s.jev_max_options)
            )
        answers = self._ask_jev(questions)

        picks: dict[str, dict[str, Any]] = {}
        p_movie = None
        for q in questions:
            answer = answers[q.id]
            code, by_llm = self._decide(q, answer)
            probs = {choose.parse_code(k): v for k, v in answer.probabilities.items()}
            picks[q.id] = {
                "id": choose.parse_code(code),
                "llm": by_llm,
                "unsure": self._unsure(answer),
                "probs": probs,
            }
            if q.id == "movie":
                p_movie = probs
        p_rest = picks["restaurant"]["probs"]

        ranked = choose.rank_combos(result.feasible, p_movie, p_rest)
        ranked = choose.apply_llm_pick(
            ranked,
            movie=picks["movie"]["id"] if picks.get("movie", {}).get("llm") else None,
            restaurant=picks["restaurant"]["id"] if picks["restaurant"]["llm"] else None,
        )
        self.feasible = {c.pair: c for c in result.feasible}
        return ranked, picks

    # ── 步驟 5、6：驗證營業時間、查精確路線 ───────────────────────

    def _verify_and_route(self, ranked: list[Ranked]) -> list[tuple[_Candidate, Timeline, dict]]:
        max_tried = PLANS_WANTED + self.s.plan_opening_hours_retry_rounds
        queue = iter(ranked)
        plans: list[tuple[_Candidate, Timeline, dict]] = []
        tried = 0
        while len(plans) < PLANS_WANTED and tried < max_tried:
            batch = []
            for r in queue:
                batch.append(r)
                if len(batch) >= min(PLANS_WANTED - len(plans), max_tried - tried):
                    break
            if not batch:
                break
            tried += len(batch)

            self.progress("verifying_hours")
            candidates = [c for c in (self._verify_hours(r) for r in batch) if c]

            self.progress("routing")
            routed = [c for c in candidates if self._exact_routes(c)]
            questions = []
            for i, c in enumerate(routed):
                questions.append(build_route_question(f"route_go_{i}", c.go))
                questions.append(build_route_question(f"route_return_{i}", c.ret))
            answers = self._ask_jev(questions)
            for i, c in enumerate(routed):
                go, go_info = self._pick_route(f"route_go_{i}", questions[2 * i], answers, c.go)
                ret, ret_info = self._pick_route(
                    f"route_return_{i}", questions[2 * i + 1], answers, c.ret
                )
                tl = build_timeline(c.combo, go, ret, self._places(c), self.cond)
                if tl is not None:
                    plans.append((c, tl, {"route_go": go_info, "route_return": ret_info}))
        return plans[:PLANS_WANTED]

    def _verify_hours(self, ranked: Ranked) -> _Candidate | None:
        combo = ranked.combo
        row = self.restaurant_rows[combo.restaurant.id]
        if row.source != "google":
            return _Candidate(ranked=ranked, combo=combo, name=row.name, address=None)
        if not has_room(
            self.d.redis, "google:details_enterprise", self.s.quota_google_details_enterprise
        ):
            return None
        details: PlaceDetails = self.d.places.details(row.external_id)
        add_usage(self.d.redis, "google:details_enterprise", 1)
        rest = replace(combo.restaurant, hours=details.hours)
        rechecked = check(
            combo.showtime,
            rest,
            combo.walk_cinema_restaurant,
            self.reach,
            self.leave,
            self.cond,
        )
        if isinstance(rechecked, Rejected):
            return None
        return _Candidate(
            ranked=ranked, combo=rechecked, name=details.name, address=details.address
        )

    def _exact_routes(self, c: _Candidate) -> bool:
        combo = c.combo
        cinema = self.cinema_eps[combo.showtime.cinema_id]
        hub = self.hub_eps[combo.restaurant.hub_id]
        if combo.order == "movie_first":
            gate = combo.showtime.starts_at - timedelta(minutes=self.cond.arrive_before_showtime)
            go = self.transit.route(self.station_ep, cinema, gate, "arrival", top=3)
            ret = self.transit.route(hub, self.station_ep, combo.leave_area_at, "depart", top=3)
        else:
            # 最晚還來得及到代表點的時間：最早抵達 ＋ 開演、最後點餐兩道關卡中較小的空檔。
            # 不能直接用最早抵達時間，往前取整後查到的車都會早於最早出門。
            slack = min(
                b for b in (combo.buffers.showtime, combo.buffers.last_order) if b is not None
            )
            latest_hub = combo.arrive_hub + timedelta(minutes=slack)
            go = self.transit.route(self.station_ep, hub, latest_hub, "arrival", top=3)
            ret = self.transit.route(cinema, self.station_ep, combo.leave_area_at, "depart", top=3)
        c.go = [r for r in go if r.leave_at >= self.earliest]
        c.ret = [r for r in ret if r.reach_at <= self.latest_home]
        # 查詢時間往前、往後取整到 15 分鐘，緊的組合可能查不到合用的車；
        # 步驟 2 的路線已經證明接得上，就退回用它（只有一條，所以不用 Jev 選）
        cinema_key = ("cinema", combo.showtime.cinema_id)
        hub_key = ("hub", combo.restaurant.hub_id)
        go_key, ret_key = (
            (cinema_key, hub_key) if combo.order == "movie_first" else (hub_key, cinema_key)
        )
        if not c.go and go_key in self.step2_go:
            c.go = [self.step2_go[go_key]]
        if not c.ret and ret_key in self.step2_ret:
            c.ret = [self.step2_ret[ret_key]]
        return bool(c.go and c.ret)

    def _unsure(self, answer: ChoiceAnswer) -> bool:
        return choose.needs_llm(answer.probabilities, self.s.jev_min_top_probability)

    def _pick_route(self, qid, question, answers, routes):
        answer = answers[qid]
        code, by_llm = self._decide(question, answer)
        index = int(code[1:])
        alternatives = None
        # Jev 沒把握就附備選，不管 LLM 有沒有回答（2026-10-20 決定）
        if self._unsure(answer):
            alternatives = [
                {
                    "summary": r.summary,
                    "depart_at": r.depart_at,
                    "arrive_at": r.arrive_at,
                    "fare_per_person": r.fare,
                    "probability": round(answer.probabilities[choose.route_code(i)], 4),
                }
                for i, r in enumerate(routes)
                if i != index
            ][: self.s.plan_alternatives_max]
        info = {
            "llm": by_llm,
            "alternatives": alternatives,
            "fare_estimated": routes[index].fare_estimated,
        }
        return routes[index], info

    def _places(self, c: _Candidate) -> TimelinePlaces:
        row = self.restaurant_rows[c.combo.restaurant.id]
        if row.source == "google":
            restaurant = Place(kind="restaurant", id=row.id, name=c.name, place_id=row.external_id)
        else:
            restaurant = Place(kind="restaurant", id=row.id, name=c.name, lat=row.lat, lng=row.lng)
        return TimelinePlaces(
            station=self.station,
            hub=self.hubs[c.combo.restaurant.hub_id],
            cinema=self.cinemas[c.combo.showtime.cinema_id],
            restaurant=restaurant,
        )

    # ── 步驟 7：結果 ───────────────────────────────────────────

    def _restaurant_name(self, rid: int) -> str | None:
        row = self.restaurant_rows[rid]
        if row.source != "google":
            return row.name
        if not has_room(self.d.redis, "google:details_pro", self.s.quota_google_details_pro):
            return None  # 5.5：Pro 額度用完時備選只顯示類別
        add_usage(self.d.redis, "google:details_pro", 1)
        return self.d.places.basic(row.external_id).name

    def _build_result(self, result: FilterResult, plans, picks) -> dict[str, Any]:
        metrics = [
            PlanMetrics(
                cost_total=tl.cost.total,
                min_buffer=tl.min_buffer,
                home_at=tl.home_at,
                walk_minutes_total=tl.walk_minutes_total,
            )
            for _, tl, _ in plans
        ]
        highlights = assign_highlights(metrics, self.station.name)
        out = []
        for i, (c, tl, routes) in enumerate(plans):
            combo = tl.combo
            show_row = self.showtime_rows[combo.showtime.id]
            rest_row = self.restaurant_rows[combo.restaurant.id]
            movie_id = combo.showtime.movie_id
            movie_pick, rest_pick = picks.get("movie"), picks["restaurant"]
            # decided_by 是 llm：LLM 真的有回答，而且第一名用了它的選擇
            movie_llm = bool(
                i == 0 and movie_pick and movie_pick["llm"] and movie_pick["id"] == movie_id
            )
            rest_llm = bool(i == 0 and rest_pick["llm"] and rest_pick["id"] == rest_row.id)

            # 備選：Jev 沒把握就附在第一名，不管 LLM 有沒有回答（2026-10-20 決定）
            alternatives: dict[str, Any] = {}
            if i == 0 and movie_pick and movie_pick["unsure"]:
                alt_ids = choose.llm_alternatives(movie_pick["probs"], movie_id)
                alternatives["movie"] = movie_alternatives(
                    c.ranked.combo,
                    alt_ids,
                    self.feasible,
                    probs=movie_pick["probs"],
                    p_restaurant=rest_pick["probs"],
                    titles={m: self.movies[m].title for m in alt_ids},
                    names=_LazyNames(self._restaurant_name),
                    cuisines={rid: r.cuisine for rid, r in self.restaurant_rows.items()},
                    plan_fare_go=tl.cost.fare_go,
                )
            if i == 0 and rest_pick["unsure"]:
                # 依 Jev 機率排序，挑接得上的補滿 2 家，可以超出前 3 名（2026-10-20 決定）
                probs = rest_pick["probs"]
                alt_ids = [
                    rid
                    for rid in sorted(self.restaurant_rows, key=lambda k: (-probs.get(k, 0.0), k))
                    if rid != rest_row.id and (movie_id, rid) in self.feasible
                ][: self.s.plan_alternatives_max]
                alternatives["restaurant"] = restaurant_alternatives(
                    c.ranked.combo,
                    alt_ids,
                    self.feasible,
                    probs=rest_pick["probs"],
                    names={rid: self._restaurant_name(rid) for rid in alt_ids},
                    cuisines={rid: self.restaurant_rows[rid].cuisine for rid in alt_ids},
                    plan_fare_go=tl.cost.fare_go,
                )
            for key in ("route_go", "route_return"):
                if routes[key]["alternatives"]:
                    alternatives[key] = routes[key]["alternatives"]
            # 一個都換不了的不輸出，免得前端顯示點了沒東西的「換一家」
            alternatives = {k: v for k, v in alternatives.items() if v}

            genre = self.movies[combo.showtime.movie_id].genre
            out.append(
                {
                    "rank": i + 1,
                    "highlight": highlights[i],
                    "score": round(c.ranked.score, 4),
                    "probabilities": {
                        "movie": round(c.ranked.p_movie, 4),
                        "restaurant": round(c.ranked.p_restaurant, 4),
                    },
                    "decided_by": {
                        "movie": "llm" if movie_llm else "jev",
                        "restaurant": "llm" if rest_llm else "jev",
                        "route_go": "llm" if routes["route_go"]["llm"] else "jev",
                        "route_return": "llm" if routes["route_return"]["llm"] else "jev",
                    },
                    "depart_at": tl.depart_at,
                    "home_at": tl.home_at,
                    "minutes_before_deadline": tl.minutes_before_deadline,
                    "min_buffer_minutes": tl.min_buffer,
                    "movie": {
                        "id": combo.showtime.movie_id,
                        "title": show_row.title,
                        "genre": genre,
                        "genre_label": self.labels["movie_genre"].get(genre or ""),
                        "runtime_min": show_row.runtime_min,
                        "cinema": show_row.cinema_name,
                        "chain": show_row.chain,
                        "hall_type": combo.showtime.hall_type,
                        "hall_type_label": HALL_TYPE_LABELS.get(combo.showtime.hall_type),
                        "language": combo.showtime.language,
                    },
                    "restaurant": {
                        "id": rest_row.id,
                        "name": c.name,
                        "cuisine": rest_row.cuisine,
                        "cuisine_label": self.labels["cuisine"].get(rest_row.cuisine or ""),
                        "address": c.address,
                        "price_range": rest_row.price_range,
                        "last_order": (
                            f"{combo.last_order_at:%H:%M}" if combo.last_order_at else None
                        ),
                        "source": rest_row.source,
                        # 營業時間看不懂或補不到時照樣排，但讓前端提示先確認（2026-10-20 決定）
                        "hours_verified": combo.last_order_at is not None,
                        "place_id": rest_row.external_id if rest_row.source == "google" else None,
                    },
                    "timeline": tl.steps,
                    "cost_per_person": {
                        "ticket": tl.cost.ticket,
                        "meal": tl.cost.meal,
                        "fare_go": tl.cost.fare_go,
                        "fare_return": tl.cost.fare_return,
                        "total": tl.cost.total,
                    },
                    # 車資是 TDX 給的就不算估計；沒給、自己估的要標出來（2026-10-20 決定）
                    "estimated": ["ticket", "meal"]
                    + (["fare_go"] if routes["route_go"]["fare_estimated"] else [])
                    + (["fare_return"] if routes["route_return"]["fare_estimated"] else []),
                    "alternatives": alternatives,
                }
            )
        return {
            "job_id": self.job_id,
            "restaurant_source": self.restaurant_source,
            "stats": {"combinations": result.combinations, "feasible": result.feasible_count},
            "plans": out,
        }


class _LazyNames(dict):
    """電影備選換了餐廳時才查店名，避免多用 Google 的額度。"""

    def __init__(self, fetch: Callable[[int], str | None]):
        super().__init__()
        self._fetch = fetch

    def get(self, key, default=None):
        if key not in self:
            self[key] = self._fetch(key)
        return self[key]


def run_plan(req: PlanRequest, job_id: str, deps: Deps, progress: Progress) -> dict[str, Any]:
    return Planner(req, job_id, deps, progress).run()
