"""PostGIS 查詢（規格書 4.4）。worker 用同步的 Session。"""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.planning.rules import max_straight_meters


def restaurants_within_walk(
    session: Session, cinema_id: int, area_id: int, max_walk_minutes: int
) -> list[tuple[int, float]]:
    """影城附近、步行上限內的餐廳 → [(餐廳 id, 直線公尺)]，由近到遠。"""
    rows = session.execute(
        text(
            """
            SELECT r.id, ST_Distance(r.geom, c.geom) AS meters
            FROM restaurants r JOIN cinemas c ON c.id = :cinema_id
            WHERE r.area_id = :area_id AND r.is_active
              AND ST_DWithin(r.geom, c.geom, :radius)
            ORDER BY meters, r.id
            """
        ),
        {
            "cinema_id": cinema_id,
            "area_id": area_id,
            "radius": max_straight_meters(max_walk_minutes),
        },
    )
    return [(rid, float(m)) for rid, m in rows]


def nearest_hubs(session: Session, area_id: int) -> dict[int, tuple[int, float]]:
    """每家餐廳最近的商圈代表點 → {餐廳 id: (代表點 id, 直線公尺)}。

    `<->` 搭配 GiST 索引找最近的一筆；沒有座標的代表點不算。
    """
    rows = session.execute(
        text(
            """
            SELECT r.id, h.id, ST_Distance(r.geom, h.geom)
            FROM restaurants r
            CROSS JOIN LATERAL (
              SELECT id, geom FROM area_hubs
              WHERE area_id = r.area_id AND geom IS NOT NULL
              ORDER BY geom <-> r.geom
              LIMIT 1
            ) h
            WHERE r.area_id = :area_id AND r.is_active AND r.geom IS NOT NULL
            """
        ),
        {"area_id": area_id},
    )
    return {rid: (hid, float(m)) for rid, hid, m in rows}


def cinema_restaurant_meters(session: Session, area_id: int) -> dict[tuple[int, int], float]:
    """商圈內每家影城到每家餐廳的直線距離 → {(影城 id, 餐廳 id): 公尺}。

    規劃時要計數「走太遠」被排除的組合，所以不先用步行上限篩掉（6.4 的 walk）。
    """
    rows = session.execute(
        text(
            """
            SELECT c.id, r.id, ST_Distance(c.geom, r.geom)
            FROM cinemas c JOIN restaurants r ON r.area_id = c.area_id
            WHERE c.area_id = :area_id AND c.is_active AND c.geom IS NOT NULL
              AND r.is_active AND r.geom IS NOT NULL
            """
        ),
        {"area_id": area_id},
    )
    return {(cid, rid): float(m) for cid, rid, m in rows}
