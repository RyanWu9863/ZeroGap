"""OSM 餐廳寫進資料庫，並判斷還沒有屬性的店（規格書 7.2、7.3）。

1. 抓所有開放商圈代表點周圍的店，去掉只賣飲料的，依距離歸到商圈
2. UPSERT（`source = 'osm'`）；這次沒抓到的設成停用；真資料進來後示意餐廳設成停用
3. 屬性還沒判斷的店：照標籤能判斷的先判斷，其他交給 LLM；結果寫回主表和 `jev_judgments`
"""

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any, Protocol
from zoneinfo import ZoneInfo

from sqlalchemy import text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.collectors.osm import (
    Hub,
    assign_areas,
    build_query,
    fetch,
    is_drink_shop,
    parse_elements,
    rule_attributes,
)
from app.models import JevJudgment, Restaurant

log = logging.getLogger(__name__)
TZ = ZoneInfo("Asia/Taipei")

FIELDS = ("category_code", "price_range", "meal_duration", "date_suitability")
# 主表欄位 → 7.3 的題目代碼
QUESTIONS = {
    "category_code": "cuisine",
    "price_range": "price_range",
    "meal_duration": "meal_duration",
    "date_suitability": "date_suitability",
}
NO_JEV = "none"  # Jev 金鑰到之前，jev_judgments.jev_version 記這個
# LLM 連續失敗這麼多次就先停：多半是連不上，硬試下去只是浪費時間；剩下的下次再補
MAX_CONSECUTIVE_FAILURES = 5


class Judge(Protocol):
    model: str

    def judge(self, name: str, tags: dict[str, str], fields: list[str]) -> dict[str, Any]: ...


def load_hubs(session: Session) -> list[Hub]:
    rows = session.execute(
        text(
            "SELECT h.id, h.area_id, h.name, ST_Y(h.geom::geometry) AS lat, "
            "ST_X(h.geom::geometry) AS lng FROM area_hubs h JOIN areas a ON a.id = h.area_id "
            "WHERE a.is_open AND h.geom IS NOT NULL ORDER BY h.id"
        )
    ).all()
    return [Hub(r.id, r.area_id, r.name, r.lat, r.lng) for r in rows]


def refresh_osm(
    session: Session,
    judge: Judge,
    fetcher: Callable[[str], dict[str, Any]] = fetch,
    keep_alive: Callable[[], None] = lambda: None,
) -> dict[str, Any]:
    hubs = load_hubs(session)
    if not hubs:
        raise RuntimeError("沒有開放商圈的代表點座標，先跑 python -m app.jobs.refresh hubs")
    places = parse_elements(fetcher(build_query(hubs)))
    meals = [p for p in places if not is_drink_shop(p.tags)]
    assigned = assign_areas(meals, hubs)
    now = datetime.now(TZ)
    stats: dict[str, Any] = {
        "fetched": len(places),
        "drink_shops": len(places) - len(meals),
        "out_of_area": len(meals) - len(assigned),
        "upserted": len(assigned),
    }

    seen = [p.external_id for p, _ in assigned]
    if assigned:
        rows = [
            {
                "source": "osm",
                "external_id": p.external_id,
                "geom": f"SRID=4326;POINT({p.lng} {p.lat})",
                "geom_fetched_at": now,
                "area_id": area_id,
                "osm_name": p.name,
                "osm_opening_hours": p.opening_hours,
                "osm_tags": p.tags,
                "is_active": True,
            }
            for p, area_id in assigned
        ]
        for i in range(0, len(rows), 500):
            stmt = insert(Restaurant).values(rows[i : i + 500])
            session.execute(
                stmt.on_conflict_do_update(
                    index_elements=["source", "external_id"],
                    set_={
                        c: stmt.excluded[c]
                        for c in ("geom", "geom_fetched_at", "area_id", "osm_name",
                                  "osm_opening_hours", "osm_tags")
                    }
                    | {"is_active": True, "updated_at": text("now()")},
                )
            )  # fmt: skip
    result = session.execute(
        update(Restaurant)
        .where(Restaurant.source == "osm", Restaurant.is_active)
        .where(Restaurant.external_id.not_in(seen or [""]))
        .values(is_active=False)
    )
    stats["deactivated"] = result.rowcount
    if assigned:
        result = session.execute(
            update(Restaurant)
            .where(Restaurant.source == "demo", Restaurant.is_active)
            .values(is_active=False)
        )
        stats["demo_deactivated"] = result.rowcount
    session.commit()

    stats.update(judge_pending(session, judge, keep_alive))
    return stats


def _record(session: Session, rid: int, field: str, value: Any, by: str, model: str) -> None:
    stmt = insert(JevJudgment).values(
        subject_type="restaurant",
        subject_id=rid,
        question=QUESTIONS[field],
        answer=str(value),
        probabilities={str(value): 1.0},
        confidence=None,
        decided_by=by,
        model_version=model,
        jev_version=NO_JEV,
        judged_at=datetime.now(TZ),
    )
    session.execute(
        stmt.on_conflict_do_update(
            index_elements=["subject_type", "subject_id", "question"],
            set_={
                c: stmt.excluded[c]
                for c in ("answer", "probabilities", "confidence", "decided_by",
                          "model_version", "jev_version", "judged_at")
            },
        )
    )  # fmt: skip


def judge_pending(
    session: Session, judge: Judge, keep_alive: Callable[[], None] = lambda: None
) -> dict[str, int]:
    rows = session.execute(
        text(
            f"""
            SELECT id, osm_name, osm_tags, {", ".join(FIELDS)} FROM restaurants
            WHERE source = 'osm' AND is_active
              AND ({" OR ".join(f"{f} IS NULL" for f in FIELDS)})
            ORDER BY id
            """
        )
    ).all()
    judged = failed = consecutive = 0
    aborted = False
    for i, row in enumerate(rows):
        tags = row.osm_tags or {}
        missing = [f for f in FIELDS if getattr(row, f) is None]
        values: dict[str, Any] = {}
        for field, value in rule_attributes(tags).items():
            if field in missing:
                values[field] = value
                _record(session, row.id, field, value, "rule", "osm-tags")
        ask = [f for f in missing if f not in values]
        if ask:
            answer = judge.judge(row.osm_name or "", tags, ask)
            for field, value in answer.items():
                values[field] = value
                _record(session, row.id, field, value, "llm", judge.model)
            if any(f not in answer for f in ask):
                failed += 1
                consecutive = consecutive + 1 if not answer else 0
            else:
                consecutive = 0
        if values:
            session.execute(update(Restaurant).where(Restaurant.id == row.id).values(**values))
        judged += 1
        if i % 20 == 19:
            session.commit()
            keep_alive()
        if consecutive >= MAX_CONSECUTIVE_FAILURES:
            log.warning("LLM 連續 %d 次判斷失敗，先停；剩下的下次再補", consecutive)
            aborted = True
            break
    session.commit()
    return {"judged": judged, "judge_failed": failed, "judge_aborted": aborted}
