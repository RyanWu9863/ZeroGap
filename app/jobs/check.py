"""Demo 前的檢查：`uv run python -m app.jobs.check`

也可以在容器裡跑：`docker compose exec api python -m app.jobs.check`。

一次看完：資料庫、Redis、API、Ollama、TDX 金鑰，資料是不是當天的，每月額度用了多少。
每一項印出「OK」「注意」或「失敗」；有「失敗」時結束碼是 1。
"""

import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import text

from app.config import get_settings
from app.db import sync_session
from app.redis_client import sync_redis
from app.redis_utils.quota import used

TZ = ZoneInfo("Asia/Taipei")
OK, WARN, FAIL = "OK  ", "注意", "失敗"


def main() -> int:
    s = get_settings()
    now = datetime.now(TZ)
    results: list[tuple[str, str, str]] = []

    def add(status: str, item: str, detail: str = "") -> None:
        results.append((status, item, detail))

    # ── 服務 ────────────────────────────────────────────────
    try:
        with sync_session()() as db:
            db.execute(text("SELECT 1"))
        add(OK, "資料庫")
    except Exception as exc:  # noqa: BLE001
        add(FAIL, "資料庫", f"連不上：{exc.__class__.__name__}（docker compose up -d）")
        return report(results)
    r = sync_redis()
    try:
        r.ping()
        add(OK, "Redis")
    except Exception as exc:  # noqa: BLE001
        add(FAIL, "Redis", f"連不上：{exc.__class__.__name__}")
    for name, url in (("API（經過 nginx）", "http://localhost:8000/api/health"),):
        try:
            ok = httpx.get(url, timeout=5).status_code == 200
            add(
                OK if ok else FAIL, name, "" if ok else "回應不是 200：docker compose up -d --build"
            )
        except httpx.HTTPError:
            add(WARN, name, "在容器裡執行時看不到 localhost:8000，可以忽略")
    if s.llm_mode == "mock":
        add(WARN, "Ollama", "LLM_MODE=mock，Jev 沒把握時不會代選")
    else:
        for base in dict.fromkeys([s.ollama_base_url, "http://localhost:11434"]):
            try:
                tags = httpx.get(f"{base}/api/tags", timeout=3).json()
                names = [m["name"] for m in tags.get("models", [])]
                status = OK if s.ollama_model in names else FAIL
                add(status, f"Ollama（{base}）", f"有 {s.ollama_model}" if status == OK
                    else f"沒有 {s.ollama_model}：ollama pull {s.ollama_model}")  # fmt: skip
                break
            except httpx.HTTPError:
                continue
        else:
            add(FAIL, "Ollama", "連不上：確認 Ollama 有開")

    # ── 外部服務 ──────────────────────────────────────────────
    add(OK if s.tdx_mode == "real" else WARN, "TDX 模式", s.tdx_mode)
    add(WARN if s.jev_mode == "mock" else OK, "Jev 模式", s.jev_mode + (
        "（狀態列會顯示 mock；要等 TypeSafe 金鑰）" if s.jev_mode == "mock" else ""))  # fmt: skip
    if s.tdx_mode == "real":
        try:
            resp = httpx.post(
                "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token",
                data={"grant_type": "client_credentials", "client_id": s.tdx_client_id,
                      "client_secret": s.tdx_client_secret},
                timeout=15,
            )  # fmt: skip
            ok = resp.status_code == 200
            add(
                OK if ok else FAIL,
                "TDX 金鑰",
                "" if ok else f"換 token 失敗 HTTP {resp.status_code}",
            )
        except httpx.HTTPError as exc:
            add(FAIL, "TDX 金鑰", f"連不上 TDX：{exc.__class__.__name__}")
    points = used(r, "tdx_points")
    add(OK if points < s.quota_tdx_points_units * 0.8 else WARN, "TDX 本月點數",
        f"{points:,} / {s.quota_tdx_points_units:,} 單位")  # fmt: skip

    # ── 資料 ────────────────────────────────────────────────
    with sync_session()() as db:
        last = dict(
            db.execute(
                text(
                    "SELECT job, max(finished_at) FROM crawl_runs WHERE status = 'success' "
                    "AND NOT (coalesce(stats, '{}'::jsonb) ? 'demo') GROUP BY job"
                )
            ).all()
        )
        for job, label, max_age in (
            ("atmovies", "開眼場次", timedelta(hours=14)),
            ("osm", "OSM 餐廳", timedelta(days=2)),
            ("tdx_stations", "TDX 車站", timedelta(days=8)),
        ):
            when = last.get(job)
            if when is None:
                add(FAIL, label, f"從沒抓過：python -m app.jobs.refresh {job_cli(job)}")
            else:
                local = when.astimezone(TZ)
                fresh = now - local <= max_age
                hint = "" if fresh else f"，太舊了：python -m app.jobs.refresh {job_cli(job)}"
                add(OK if fresh else WARN, label, f"上次成功 {local:%m/%d %H:%M}{hint}")
        rows = db.execute(
            text(
                """
                SELECT a.name,
                  (SELECT count(*) FROM showtimes s JOIN cinemas c ON c.id = s.cinema_id
                   WHERE c.area_id = a.id AND c.is_active AND s.starts_at > now()) AS shows,
                  (SELECT count(*) FROM restaurants r WHERE r.area_id = a.id AND r.is_active
                   AND r.price_range IS NOT NULL AND r.meal_duration IS NOT NULL) AS ready
                FROM areas a WHERE a.is_open ORDER BY a.sort_order
                """
            )
        ).all()
        for name, shows, ready in rows:
            status = OK if shows and ready >= 10 else (FAIL if not shows else WARN)
            add(status, f"商圈 {name}", f"之後的場次 {shows} 場、可排的餐廳 {ready} 家")
        pending = db.scalar(
            text(
                "SELECT count(*) FROM restaurants WHERE source = 'osm' AND is_active AND "
                "(price_range IS NULL OR meal_duration IS NULL OR category_code IS NULL "
                "OR date_suitability IS NULL)"
            )
        )
        detail = "全部判斷完" if pending == 0 else f"還有 {pending} 家沒判斷完（每天會繼續補）"
        add(OK if pending == 0 else WARN, "店家屬性判斷", detail)
        dates = db.scalars(
            text(
                "SELECT DISTINCT (starts_at AT TIME ZONE 'Asia/Taipei')::date FROM showtimes s "
                "JOIN cinemas c ON c.id = s.cinema_id WHERE c.is_active AND s.starts_at > now() "
                "ORDER BY 1"
            )
        ).all()
        add(OK if dates else FAIL, "有場次的日期", ", ".join(f"{d:%m/%d}" for d in dates) or "沒有")
    return report(results)


def job_cli(job: str) -> str:
    return {"atmovies": "atmovies", "osm": "osm", "tdx_stations": "stations"}[job]


def report(results: list[tuple[str, str, str]]) -> int:
    for status, item, detail in results:
        print(f"[{status}] {item}{'：' + detail if detail else ''}")
    failed = sum(1 for s, _, _ in results if s == FAIL)
    print(f"\n{'有 ' + str(failed) + ' 項失敗，Demo 前要處理' if failed else '可以 Demo'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
