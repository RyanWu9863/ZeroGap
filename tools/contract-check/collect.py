"""收集後端真正的回應，給 check.ts 用前端的 zod 驗證（前後端的合約檢查）。

    uv run --project backend python tools/contract-check/collect.py
    node tools/contract-check/check.ts tools/contract-check/out

API 要在 localhost:8000 跑著。規劃結果用模擬版 TDX 在本機產生（格式一樣，不花 TDX 額度）。
"""

# 要先把 backend/ 加進 sys.path 才能 import app
# ruff: noqa: E402

import json
import sys
from datetime import date
from pathlib import Path

# 後端程式在 backend/，加進 sys.path 才找得到 app
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

import httpx
import redis
from sqlalchemy import text

from app.config import Settings
from app.db import sync_session
from app.jev.mock import MockJev
from app.llm import MockLlm
from app.places import MockPlaces
from app.planner import Deps, PlanError, run_plan
from app.schemas import PlanRequest, PlanResult
from app.transit import MockTransit

OUT = Path(__file__).parent / "out"
API = "http://localhost:8000/api"


def save(name: str, obj) -> None:
    (OUT / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def main(area: str = "zhongli") -> None:
    OUT.mkdir(exist_ok=True)
    today = date.today().isoformat()
    for name, path in {
        "counties": "/counties", "areas": "/areas?county=Taoyuan",
        "stations": "/stations?county=Taoyuan", "categories_cuisine": "/categories?kind=cuisine",
        "categories_genre": "/categories?kind=movie_genre", "coverage": f"/coverage?area={area}",
        "coverage_date": f"/coverage?area={area}&date={today}", "status": "/status",
    }.items():  # fmt: skip
        save(name, httpx.get(API + path, timeout=20).json())
    save("error_body", httpx.get(API + "/areas?county=Nowhere", timeout=20).json()["error"])

    r = redis.Redis.from_url("redis://localhost:6379/12", decode_responses=True)
    r.flushdb()
    with sync_session()() as db:
        sid = db.scalar(
            text("SELECT id FROM stations WHERE operator='TRA' AND name='中壢' AND is_active")
        )
        base = dict(area=area, origin_station_id=sid, date=today, earliest_departure="17:30",
                    latest_home="23:30", order="movie_first", budget_per_person=1500,
                    max_walk_minutes=15)  # fmt: skip
        settings = Settings(tdx_mode="mock", tdx_per_minute=1000)
        deps = Deps(db, r, MockTransit(), MockJev(), MockLlm(), MockPlaces(), settings)
        result = run_plan(PlanRequest.model_validate(base), "contract", deps, lambda *a, **k: None)
        save("plan_result", PlanResult.model_validate(result).to_json())
        try:
            run_plan(PlanRequest.model_validate({**base, "budget_per_person": 100}), "c2", deps,
                     lambda *a, **k: None)  # fmt: skip
        except PlanError as e:
            save("plan_error", {"code": e.code, "message": e.message, "reasons": e.reasons})
    r.flushdb()
    save("progress_filtering", {"stage": "filtering", "combinations": 1880, "feasible": 39})
    save("progress_waiting", {"stage": "waiting_quota", "service": "tdx", "wait_seconds": 59})
    save("queued", {"job_id": "x", "position": 1})
    print(f"已存到 {OUT}")


if __name__ == "__main__":
    main(*sys.argv[1:])
