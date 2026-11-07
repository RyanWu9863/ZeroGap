# 子專案 ①「連結取餐號」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 規劃排出來的結果由後端存 7 天，可以用 `GET /api/plans/{job_id}` 拿回同一份；MCP 的 `plan_date` 回傳時附上網頁連結 `share_url`。

**Architecture:** 新模組 `app/saved_plans.py` 負責存、讀、組網址。`plan_stream.plan_events`（SSE 和 MCP 共用）在交出 `result` 事件前呼叫 `save_plan`，並透過新的 `on_saved` 回呼告訴呼叫端有沒有存成功。`api.py` 加一個讀取端點；`mcp.py` 在回傳時加 `share_url`。

**Tech Stack:** FastAPI、redis.asyncio、Pydantic v2、MCP Python SDK（`MCPServer`）、pytest＋pytest-asyncio（`asyncio_mode = "auto"`）、uv、ruff。

**Spec:** `docs/superpowers/specs/2026-11-07-plan-share-link-design.md`

## Global Constraints

- 工作資料夾：`~/Desktop/JEV/ZeroGap/team-share`（git worktree，分支 `feat/plan-share-link`，從團隊 `origin/main` `70dcc2a` 開）。後端指令在 `backend/` 裡跑：`uv run pytest …`、`uv run ruff check`、`uv run ruff format --check`。
- 整合測試需要 `docker compose up -d postgres redis`（在 repo 根目錄；PostgreSQL 對外 5433、Redis 6379）；連不上會整批略過，**略過不算通過**，要開好 Docker 再跑。測試用 Redis 第 15 號資料庫、`zerogap_test` 資料庫，不碰開發資料。
- Redis key：`plan:{job_id}:saved`；過期預設 `604800` 秒（7 天）；設定名 `saved_plan_ttl_seconds`、`public_web_base_url`（環境變數 `SAVED_PLAN_TTL_SECONDS`、`PUBLIC_WEB_BASE_URL`）。
- `job_id` 格式：`^[0-9a-f]{32}$`（`uuid.uuid4().hex`）。分享網址：`{public_web_base_url 去掉結尾 /}/p/{job_id}`；沒設定就不附。
- 404 一律 `ApiError(404, "NOT_FOUND", "找不到這份行程，可能已經超過 7 天")`（天數由設定算出）。
- SSE `result` 事件的內容**不能改**（前端已依它解析）。
- 存檔失敗不能讓規劃失敗：只記 warning、照樣交出結果。
- 只存成功的結果；`error` 不存。
- 程式註解、說明、commit 訊息用繁體中文、白話。commit 結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **只 add 自己改的檔案，不用 `git add -A`**（團隊 CLAUDE.md）。改規格書要同步 `docs/spec-discussion.md`。
- 除錯時不可以直接打 TDX（要經過限流器）；本計畫的測試全用模擬版，不需要金鑰。
- 不碰 `frontend/`。不推送、不開 PR，直到 Task 6；開 PR 後**不合併**，合併前問使用者。

## 檔案地圖

| 路徑 | 做什麼 |
|---|---|
| `backend/app/config.py` | Task 1：兩個新設定 |
| `backend/app/saved_plans.py` | Task 1：新檔，存、讀、組網址 |
| `backend/tests/unit/test_saved_plans.py` | Task 1：新檔，單元測試（不需要 Docker） |
| `backend/app/plan_stream.py` | Task 2：交出 `result` 前存檔、`on_saved` 回呼 |
| `backend/tests/integration/test_plan_stream.py` | Task 2：三個新測試 |
| `backend/app/schemas/__init__.py` | Task 3：`SavedPlanOut` |
| `backend/app/api.py` | Task 3：`GET /api/plans/{job_id}` |
| `backend/tests/integration/test_api.py` | Task 3：三個新測試 |
| `backend/app/mcp.py` | Task 4：`share_url` |
| `backend/tests/integration/test_mcp.py` | Task 4：兩個新測試 |
| `.env.example`、`docs/backend-spec.md`、`docs/spec-discussion.md`、`docs/導讀_分享連結.md` | Task 5 |

---

### Task 1：設定＋`saved_plans` 模組

**Files:**
- Modify：`backend/app/config.py`（「快取」區塊）
- Create：`backend/app/saved_plans.py`
- Test：`backend/tests/unit/test_saved_plans.py`

**Interfaces:**
- Produces：
  - `Settings.saved_plan_ttl_seconds: int = 7 * 24 * 3600`、`Settings.public_web_base_url: str = ""`
  - `saved_plans.JOB_ID_RE: re.Pattern[str]`
  - `saved_plans.saved_key(job_id: str) -> str`
  - `async saved_plans.save_plan(r, s: Settings, job_id: str, request: dict[str, Any], result: dict[str, Any], now: datetime) -> bool`
  - `async saved_plans.load_plan(r, job_id: str) -> dict[str, Any] | None`
  - `saved_plans.share_url(s: Settings, job_id: str) -> str | None`
  - `saved_plans.not_found_message(s: Settings) -> str`

- [ ] **Step 1：寫失敗的單元測試**

`backend/tests/unit/test_saved_plans.py`：
```python
"""分享連結的存、讀、組網址（規格書 6.8）。不需要 Docker：用記憶體裡的假 Redis。"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
import redis

from app import saved_plans
from app.config import Settings

JOB = "a" * 32
NOW = datetime(2026, 11, 7, 21, 3, tzinfo=ZoneInfo("Asia/Taipei"))


def settings(**values) -> Settings:
    return Settings(_env_file=None, **values)


class MemoryRedis:
    def __init__(self):
        self.data: dict[str, str] = {}
        self.ex: int | None = None

    async def set(self, key, value, ex=None):
        self.data[key] = value
        self.ex = ex

    async def get(self, key):
        return self.data.get(key)


class BrokenRedis:
    async def set(self, *args, **kwargs):
        raise redis.RedisError("OOM command not allowed")


def test_share_url_is_none_without_base():
    assert saved_plans.share_url(settings(), JOB) is None


def test_share_url_strips_trailing_slash():
    s = settings(public_web_base_url="https://zerogap.example/")
    assert saved_plans.share_url(s, JOB) == f"https://zerogap.example/p/{JOB}"


@pytest.mark.parametrize(
    ("value", "ok"),
    [(JOB, True), ("A" * 32, False), ("a" * 31, False), ("a" * 33, False), ("g" * 32, False), ("../" + "a" * 29, False)],
)
def test_job_id_pattern(value, ok):
    assert bool(saved_plans.JOB_ID_RE.fullmatch(value)) is ok


def test_not_found_message_uses_ttl_days():
    assert saved_plans.not_found_message(settings()) == "找不到這份行程，可能已經超過 7 天"
    assert "3 天" in saved_plans.not_found_message(settings(saved_plan_ttl_seconds=3 * 86400))


async def test_save_then_load_round_trip():
    r = MemoryRedis()
    assert await saved_plans.save_plan(r, settings(), JOB, {"area": "taoyuan"}, {"plans": []}, NOW) is True
    assert r.ex == 7 * 24 * 3600
    assert await saved_plans.load_plan(r, JOB) == {
        "job_id": JOB,
        "request": {"area": "taoyuan"},
        "result": {"plans": []},
        "created_at": "2026-11-07T21:03:00+08:00",
        "expires_at": "2026-11-14T21:03:00+08:00",
    }


async def test_load_missing_is_none():
    assert await saved_plans.load_plan(MemoryRedis(), JOB) is None


async def test_save_returns_false_when_redis_fails():
    assert await saved_plans.save_plan(BrokenRedis(), settings(), JOB, {}, {}, NOW) is False
```

- [ ] **Step 2：確認失敗**

Run：`cd backend && uv run pytest tests/unit/test_saved_plans.py -q`
Expected：FAIL，`ImportError: cannot import name 'saved_plans'`。

- [ ] **Step 3：加設定**

`backend/app/config.py` 的「快取」區塊（`llm_status_ttl_seconds` 下面）加：
```python
    # 分享連結（規格書 6.8）：排出來的結果存幾秒；網頁的網址（沒設定時 MCP 不附 share_url）
    saved_plan_ttl_seconds: int = 7 * 24 * 3600
    public_web_base_url: str = ""
```

- [ ] **Step 4：實作 `saved_plans.py`**

```python
"""分享連結（取餐號碼牌，規格書 6.8）：排出來的結果存起來，用 job_id 拿回同一份。

`plan_stream.plan_events` 交出 result 前呼叫 `save_plan`；`GET /api/plans/{job_id}` 用 `load_plan`；
MCP 的 `plan_date` 用 `share_url` 組出網頁連結。存不進去不影響規劃，只是沒有連結。
"""

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any

import redis
import redis.asyncio as aioredis

from app.config import Settings

log = logging.getLogger(__name__)

JOB_ID_RE = re.compile(r"[0-9a-f]{32}")


def saved_key(job_id: str) -> str:
    return f"plan:{job_id}:saved"


async def save_plan(
    r: aioredis.Redis,
    s: Settings,
    job_id: str,
    request: dict[str, Any],
    result: dict[str, Any],
    now: datetime,
) -> bool:
    """存成功回 True；Redis 出錯（例如記憶體滿了）只記 warning、回 False，不丟例外。"""
    ttl = s.saved_plan_ttl_seconds
    doc = {
        "job_id": job_id,
        "request": request,
        "result": result,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(seconds=ttl)).isoformat(),
    }
    try:
        await r.set(saved_key(job_id), json.dumps(doc, ensure_ascii=False), ex=ttl)
    except redis.RedisError:
        log.warning("分享用的行程存不進 Redis（job_id=%s），這次不附連結", job_id, exc_info=True)
        return False
    return True


async def load_plan(r: aioredis.Redis, job_id: str) -> dict[str, Any] | None:
    raw = await r.get(saved_key(job_id))
    return json.loads(raw) if raw else None


def share_url(s: Settings, job_id: str) -> str | None:
    base = s.public_web_base_url.rstrip("/")
    return f"{base}/p/{job_id}" if base else None


def not_found_message(s: Settings) -> str:
    return f"找不到這份行程，可能已經超過 {s.saved_plan_ttl_seconds // 86400} 天"
```
（`JOB_ID_RE` 用 `fullmatch` 比對，所以不寫 `^…$`。）

- [ ] **Step 5：確認通過＋lint**

Run：`uv run pytest tests/unit/test_saved_plans.py -q && uv run ruff check app/saved_plans.py tests/unit/test_saved_plans.py && uv run ruff format --check app/saved_plans.py tests/unit/test_saved_plans.py`
Expected：全部 PASS（`test_job_id_pattern` 6 組＋其他 6 個）；ruff 無錯。format 不合時執行 `uv run ruff format <檔案>` 再跑一次。

- [ ] **Step 6：Commit**

```bash
git add backend/app/config.py backend/app/saved_plans.py backend/tests/unit/test_saved_plans.py
git commit -m "feat(backend): 分享連結的存、讀、組網址（saved_plans）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2：`plan_events` 交出結果前存檔

**Files:**
- Modify：`backend/app/plan_stream.py`
- Test：`backend/tests/integration/test_plan_stream.py`

**Interfaces:**
- Consumes：Task 1 的 `save_plan`、`load_plan`、`saved_key`。
- Produces：`plan_events(r, s, job_id, body, ip, disconnected=_never, on_saved: Callable[[bool], None] | None = None)`；收到 `result` 時先 `save_plan(…, now=datetime.now(TZ))`，呼叫 `on_saved(成功與否)`，再 `yield`。

- [ ] **Step 1：開 Docker、確認現有測試會跑（不是略過）**

```bash
cd ~/Desktop/JEV/ZeroGap/team-share && docker compose up -d postgres redis
cd backend && uv run pytest tests/integration/test_plan_stream.py -q
```
Expected：現有 2 個 passed（**不是 skipped**）。

- [ ] **Step 2：寫失敗的測試**

在 `backend/tests/integration/test_plan_stream.py` 最上面的 import 加 `from app import plan_stream, saved_plans`（取代原本的 `from app import plan_stream`），檔案最後加：
```python
async def _run_until(events, name):
    async for got, data in events:
        if got == name:
            return data
    return None


async def test_result_is_saved_before_it_is_handed_out(fake_queue, redis_url):
    final, _cancelled = fake_queue
    job = "a" * 32
    final["event"] = ("result", {"job_id": job, "plans": []})
    r = aioredis.from_url(redis_url, decode_responses=True)
    s = get_settings()
    saved: list[bool] = []
    events = plan_stream.plan_events(r, s, job, {"area": "taoyuan"}, "1.2.3.5", on_saved=saved.append)
    async for name, _data in events:
        if name == "result":
            # 交出 result 的這一刻就要讀得到（MCP 拿到結果馬上回傳連結）
            doc = await saved_plans.load_plan(r, job)
            break
    await events.aclose()
    assert saved == [True]
    assert doc["result"] == {"job_id": job, "plans": []}
    assert doc["request"] == {"area": "taoyuan"}
    ttl = await r.ttl(saved_plans.saved_key(job))
    assert s.saved_plan_ttl_seconds - 60 < ttl <= s.saved_plan_ttl_seconds
    await r.delete(saved_plans.saved_key(job))
    await r.aclose()


async def test_error_is_not_saved(fake_queue, redis_url):
    final, _cancelled = fake_queue
    job = "b" * 32
    final["event"] = ("error", {"code": "NO_FEASIBLE", "message": "排不出來"})
    r = aioredis.from_url(redis_url, decode_responses=True)
    saved: list[bool] = []
    events = plan_stream.plan_events(r, get_settings(), job, {}, "1.2.3.6", on_saved=saved.append)
    assert await _run_until(events, "error") is not None
    await events.aclose()
    assert saved == []
    assert await r.exists(saved_plans.saved_key(job)) == 0
    await r.aclose()


async def test_result_still_handed_out_when_saving_fails(fake_queue, redis_url, monkeypatch):
    final, _cancelled = fake_queue
    job = "c" * 32
    final["event"] = ("result", {"job_id": job, "plans": []})

    async def broken_save(*_args, **_kwargs):
        return False

    monkeypatch.setattr(plan_stream, "save_plan", broken_save)
    r = aioredis.from_url(redis_url, decode_responses=True)
    saved: list[bool] = []
    events = plan_stream.plan_events(r, get_settings(), job, {}, "1.2.3.7", on_saved=saved.append)
    assert await _run_until(events, "result") == {"job_id": job, "plans": []}
    await events.aclose()
    assert saved == [False]
    await r.aclose()
```

- [ ] **Step 3：確認失敗**

Run：`uv run pytest tests/integration/test_plan_stream.py -q`
Expected：新的 3 個 FAIL（`TypeError: plan_events() got an unexpected keyword argument 'on_saved'`），舊的 2 個仍 PASS。

- [ ] **Step 4：實作**

`backend/app/plan_stream.py`：
1. 模組說明第 2 點後面加一行：`   收到 result 時先存一份（分享連結，規格書 6.8），再交出去；存不進去不影響規劃`
2. import 加：
```python
from datetime import datetime
```
```python
from app.saved_plans import save_plan
from app.services import TZ, ApiError, sse
```
（原本是 `from app.services import ApiError, sse`；`TZ` 是 `services.py` 已有的 `ZoneInfo("Asia/Taipei")`。）
3. `plan_events` 的參數最後加：
```python
    on_saved: Callable[[bool], None] | None = None,
```
4. 迴圈裡收到訊息的那段改成（只多了中間 4 行）：
```python
            if msg is not None:
                event = json.loads(msg["data"])
                # 送出前就要標記：MCP 拿到結果就離開，generator 停在 yield，
                # 收尾時才不會把剛跑完的工作停掉（2026-10-24 bug 清單 L2）
                finished = event["event"] in ("result", "error")
                if event["event"] == "result":
                    # 分享連結：交出結果前先存好，MCP 拿到結果就能馬上給連結（規格書 6.8）
                    ok = await save_plan(r, s, job_id, body, event["data"], datetime.now(TZ))
                    if on_saved is not None:
                        on_saved(ok)
                yield event["event"], event["data"]
```

- [ ] **Step 5：確認通過**

Run：`uv run pytest tests/integration/test_plan_stream.py tests/unit/test_saved_plans.py -q && uv run ruff check app tests && uv run ruff format --check app tests`
Expected：plan_stream 5 passed、saved_plans 全過；ruff 無錯。

- [ ] **Step 6：Commit**

```bash
git add backend/app/plan_stream.py backend/tests/integration/test_plan_stream.py
git commit -m "feat(backend): 規劃排出來時先存一份給分享連結用，存不進去也照樣交出結果

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3：`GET /api/plans/{job_id}`

**Files:**
- Modify：`backend/app/schemas/__init__.py`、`backend/app/api.py`
- Test：`backend/tests/integration/test_api.py`

**Interfaces:**
- Consumes：Task 1 的 `JOB_ID_RE`、`load_plan`、`not_found_message`；Task 2 讓 `POST /api/plans` 會存檔。
- Produces：`SavedPlanOut`（`job_id: str`、`request: dict[str, Any]`、`result: dict[str, Any]`、`created_at: datetime`、`expires_at: datetime`）；端點 `GET /api/plans/{job_id}`（`dependencies=read`）。

- [ ] **Step 1：寫失敗的測試**

`backend/tests/integration/test_api.py` 在「`POST /api/plans`：SSE」那一節最後（`test_plan_stream_error_event` 之後）加：
```python
# ── GET /api/plans/{job_id}：分享連結（規格書 6.8） ──────────────────────


async def test_saved_plan_round_trip(client, engine, worker):
    res = await client.post("/api/plans", json=plan_body(engine), timeout=60)
    result = parse_sse(res.text)[-1][1]
    job = result["job_id"]

    got = await client.get(f"/api/plans/{job}")
    assert got.status_code == 200
    body = got.json()
    assert body["job_id"] == job
    assert body["result"] == result  # 跟 SSE 交出的同一份，沒有重排
    assert body["request"]["area"] == "taoyuan"
    assert body["created_at"].endswith("+08:00")
    created = datetime.fromisoformat(body["created_at"])
    expires = datetime.fromisoformat(body["expires_at"])
    assert expires - created == timedelta(days=7)


@pytest.mark.parametrize("job", ["a" * 32, "A" * 32, "not-a-job-id"])
async def test_saved_plan_not_found(client, job):
    res = await client.get(f"/api/plans/{job}")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
    assert "7 天" in res.json()["error"]["message"]


async def test_saved_plan_uses_read_limit(client):
    override(api_read_per_minute=1)
    assert (await client.get(f"/api/plans/{'a' * 32}")).status_code == 404
    res = await client.get(f"/api/plans/{'a' * 32}")
    assert res.status_code == 429
    assert "Retry-After" in res.headers
```
（先看一下 `test_read_rate_limit` 確認 `override` 在這個檔案的用法一致；錯誤回應格式是 `{"error": {"code", "message"}}`，見 `test_unknown_county_is_404_with_error_format`。）

- [ ] **Step 2：確認失敗**

Run：`uv run pytest tests/integration/test_api.py -q -k saved_plan`
Expected：FAIL（路徑不存在，回 404 但 `test_saved_plan_round_trip` 拿不到 200；或 405）。

- [ ] **Step 3：`SavedPlanOut`**

`backend/app/schemas/__init__.py` 在 `PlanResult` 類別後面加：
```python
class SavedPlanOut(_Model):
    """GET /api/plans/{job_id}（規格書 6.8）。request、result 原樣回傳：
    7 天內後端可能改版，舊資料不要因為新版的驗證而打不開；前端自己用 zod 驗。"""

    job_id: str
    request: dict[str, Any]
    result: dict[str, Any]
    created_at: datetime
    expires_at: datetime
```
（`Any`、`datetime` 這個檔案已經有 import。）

- [ ] **Step 4：端點**

`backend/app/api.py`：
- import 加 `from app import saved_plans`（和 `from app import services` 放一起，可寫成 `from app import saved_plans, services`）、`from app.services import ApiError`；`from app.schemas import (...)` 加 `SavedPlanOut`。
- 在 `create_plan` 後面加：
```python
@router.get("/plans/{job_id}", response_model=SavedPlanOut, dependencies=read)
async def get_saved_plan(job_id: str, r: Redis, s: Conf):
    """分享連結（6.8）：拿回當初排出來的同一份結果。格式不對或過期都回 404。"""
    doc = await saved_plans.load_plan(r, job_id) if saved_plans.JOB_ID_RE.fullmatch(job_id) else None
    if doc is None:
        raise ApiError(404, "NOT_FOUND", saved_plans.not_found_message(s))
    return doc
```

- [ ] **Step 5：確認通過**

Run：`uv run pytest tests/integration/test_api.py -q && uv run ruff check app tests && uv run ruff format --check app tests`
Expected：test_api 全部通過（含新的 5 個：round_trip 1、not_found 3、read_limit 1）；ruff 無錯。

- [ ] **Step 6：Commit**

```bash
git add backend/app/schemas/__init__.py backend/app/api.py backend/tests/integration/test_api.py
git commit -m "feat(backend): GET /api/plans/{job_id} 拿回分享的行程（保留 7 天）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4：MCP `plan_date` 附上 `share_url`

**Files:**
- Modify：`backend/app/mcp.py`
- Test：`backend/tests/integration/test_mcp.py`

**Interfaces:**
- Consumes：Task 1 `share_url`；Task 2 `plan_events(..., on_saved=...)`。
- Produces：`plan_date` 回傳 `{**result, "share_url": str}`（有設定且存成功時）；否則回傳原本的結果。

- [ ] **Step 1：寫失敗的測試**

`backend/tests/integration/test_mcp.py`：import 加 `from app import saved_plans`（若檔案已有 `from app...` 就併在一起）；在 `test_plan_date_reports_progress_and_returns_result` 後面加：
```python
async def test_plan_date_returns_share_url(env, worker, engine, monkeypatch, redis_url):
    monkeypatch.setenv("PUBLIC_WEB_BASE_URL", "https://zerogap.example/")
    get_settings.cache_clear()
    with engine.connect() as c:
        sid = c.scalar(text("SELECT id FROM stations WHERE station_uid = 'demo-TRA-zhongli'"))
    async with connect() as client:
        result = await client.call_tool("plan_date", plan_args(sid), read_timeout_seconds=120)
    out = data(result)
    job = out["job_id"]
    assert out["share_url"] == f"https://zerogap.example/p/{job}"
    # 連結真的打得開：存下來的跟 MCP 回傳的是同一份
    r = redis.Redis.from_url(redis_url, decode_responses=True)
    saved = json.loads(r.get(saved_plans.saved_key(job)))
    assert saved["result"]["plans"] == out["plans"]
    r.close()


async def test_plan_date_without_base_url_has_no_share_url(env, worker, engine):
    with engine.connect() as c:
        sid = c.scalar(text("SELECT id FROM stations WHERE station_uid = 'demo-TRA-zhongli'"))
    async with connect() as client:
        result = await client.call_tool("plan_date", plan_args(sid), read_timeout_seconds=120)
    assert "share_url" not in data(result)
```
（`get_settings`、`json`、`redis`、`text` 這個檔案已經有 import；沒有的話補上。`env` fixture 會在開始和結束時清設定快取。）

- [ ] **Step 2：確認失敗**

Run：`uv run pytest tests/integration/test_mcp.py -q -k share_url`
Expected：`test_plan_date_returns_share_url` FAIL（`KeyError: 'share_url'`）；另一個 PASS。

- [ ] **Step 3：實作**

`backend/app/mcp.py`：
- import 加 `from app.saved_plans import share_url`。
- `plan_date` 的 docstring 第一段後面加一行：`    回傳的 share_url 是網頁版連結，請一併給使用者：點開可以看完整的時間軸和每段緩衝。`
- `events = plan_events(...)` 那一行改成：
```python
    saved: list[bool] = []
    events = plan_events(r, s, job_id, req.model_dump(mode="json"), ip, on_saved=saved.append)
```
- 迴圈裡 `if name == "result": return data` 改成：
```python
            if name == "result":
                # 分享連結（規格書 6.8）：有設定網頁網址、而且真的存起來了才附
                url = share_url(s, job_id) if saved and saved[-1] else None
                return {**data, "share_url": url} if url else data
```

- [ ] **Step 4：確認通過＋整個後端跑一次**

Run：
```bash
uv run pytest tests/integration/test_mcp.py -q
uv run pytest -q
uv run ruff check . && uv run ruff format --check .
```
Expected：test_mcp 全過；全部測試通過（記下 passed／skipped 數字，**skipped 不應包含 integration**）；ruff 無錯。

- [ ] **Step 5：Commit**

```bash
git add backend/app/mcp.py backend/tests/integration/test_mcp.py
git commit -m "feat(mcp): plan_date 回傳附上網頁連結 share_url

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5：規格書 v0.21、討論紀錄、設定範例、導讀

**Files:**
- Modify：`docs/backend-spec.md`、`docs/spec-discussion.md`、`.env.example`
- Create：`docs/導讀_分享連結.md`

- [ ] **Step 1：`.env.example`**

在「連線」區塊後面加：
```
# --- 分享連結（規格書 6.8）---
# 網頁的網址：MCP 的 plan_date 會回傳 {這個網址}/p/{job_id}。沒填就不附連結。
# 本機 Demo 例如 http://localhost:5173
PUBLIC_WEB_BASE_URL=
# 排出來的結果保留幾秒（預設 7 天）
# SAVED_PLAN_TTL_SECONDS=604800
```

- [ ] **Step 2：規格書 `docs/backend-spec.md`**

1. 表頭「版本」改成以 `v0.21（分享連結：排出來的結果存 7 天，新增 GET /api/plans/{job_id}；MCP plan_date 回傳 share_url，見 5.2、6.2、6.6、6.8、8.2、10.1。v0.19、v0.20 在 PR #1、#2，合併時依合併順序調整版本號。` 開頭，後面接原本 v0.18 起的說明；「日期」改 `2026-11-07`。
2. 5.2 Key 一覽加一列：`| 分享連結 | plan:{job_id}:saved | string（JSON：job_id、request、result、created_at、expires_at） | 7 天【預設】（SAVED_PLAN_TTL_SECONDS） |`
3. 6.2 端點一覽在 `POST /api/plans` 下面加：`| GET | /api/plans/{job_id} | 分享連結：拿回當初排出來的同一份結果（6.8）。保留 7 天，過期或格式不對回 404 | plan_date 的 share_url 指向網頁，網頁再呼叫這個端點 |`
4. 6.6 工具表 `plan_date` 的「回傳」改成：`同 6.5 的結果；有設定 PUBLIC_WEB_BASE_URL 且存檔成功時，多一個 share_url（6.8）`；「`plan_date` 的執行流程」第 4 點後面加一句：`結果附上 share_url＝{PUBLIC_WEB_BASE_URL}/p/{job_id}，工具說明請 AI 一併給使用者（v0.21）。`
5. 在 6.7 之後新增 `### 6.8 分享連結 GET /api/plans/{job_id}`，內容照設計規格 3.1、3.2 寫：存在哪裡（`plan_events` 交出 result 前，SSE 和 MCP 共用）、存什麼（附 JSON 範例）、7 天、存不進去不影響規劃、`job_id` 格式、404 訊息、限流同其他查詢、request 和 result 原樣回傳的理由、用「目前位置」出發時座標照原樣存（前端分享時提醒，2026-11-07 使用者決定）。
6. 8.2 環境變數：補 `PUBLIC_WEB_BASE_URL`、`SAVED_PLAN_TTL_SECONDS` 的說明（照該節現有格式）。
7. 10.1 預設值加一列：分享連結保留 7 天。

- [ ] **Step 3：討論紀錄 `docs/spec-discussion.md`**

在「`### 2026-10-29 重跑中壢：放寬條件反而排不出來（10/21）`」那一節之後、「`## 6. 剩下的步驟`」之前，加一節 `### 2026-11-07 分享連結（規格書 v0.21）`，用條列寫：起因（MCP 只回文字，看不到時間軸；前端重新設計要分享頁）、決定 S1～S6（設計規格第 2 節，各附一句理由）、改了哪些檔案、測試結果（Task 4 Step 4 的數字）。

- [ ] **Step 4：白話導讀 `docs/導讀_分享連結.md`**

給組員和使用者看，繁體中文、比喻、短句，章節：
1. **這是什麼**（取餐號碼牌比喻：排好的行程放在櫃台 7 天，憑號碼拿回同一份）
2. **怎麼用**（網頁：排好後網址變 `/p/編號`［前端第 4 批］；AI 助理：`plan_date` 回傳裡的 `share_url`；直接打 API：`curl http://localhost:8000/api/plans/<job_id>`）
3. **要設定什麼**（`.env` 的 `PUBLIC_WEB_BASE_URL`；沒設就不給連結）
4. **隱私**（連結 32 碼亂數猜不到，但拿到連結的人看得到內容，包括用目前位置出發時的座標；前端分享時會提醒）
5. **出問題時**（404 的兩種原因；Redis 滿了時規劃照常、只是沒連結；去哪裡看日誌：`docker compose logs api | grep 分享`）
6. **改了哪些檔案**（表格）

- [ ] **Step 5：Commit**

```bash
git add .env.example docs/backend-spec.md docs/spec-discussion.md docs/導讀_分享連結.md
git commit -m "docs: 規格書 v0.21 分享連結、討論紀錄、設定範例、白話導讀

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6：推分支、開 PR（不合併）

- [ ] **Step 1：最後檢查**

```bash
cd ~/Desktop/JEV/ZeroGap/team-share/backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .
cd .. && git log --oneline origin/main..HEAD
git log --format='%ae' origin/main..HEAD | sort | uniq -c   # 不能出現 chensamuel0123@gmail.com（使用者 11/07 要求匿名）
git diff --stat origin/main..HEAD -- frontend   # 必須沒有輸出
```

- [ ] **Step 2：推分支**

`git push -u git@github.com:RyanWu9863/ZeroGap.git feat/plan-share-link`

- [ ] **Step 3：開 PR**

`gh pr create -R RyanWu9863/ZeroGap --base main --head feat/plan-share-link --title "分享連結：後端存結果 7 天、GET /api/plans/{job_id}、MCP 附 share_url（規格書 v0.21）" --body-file <檔案>`；內文：做了什麼（照導讀第 1、2 節）、commit 清單、測試數字、規格書版本號與 PR #1／#2 的關係（誰後合併誰調版本號、`mcp.py` 重疊的只有 `plan_date` 回傳那幾行）、請 ② 審查、最後一行 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。**不合併**，回報網址給使用者。

---

## 進度表

| Task | 狀態 |
|---|---|
| 1 設定＋saved_plans | ✅ 23db169 |
| 2 plan_events 存檔 | ✅ 100741f |
| 3 GET 端點 | ✅ e7dd8eb |
| 4 MCP share_url | ✅ ca6b82d |
| 5 規格書、紀錄、導讀 | ✅ f4f4af4；最終審查修正 70ea9e7（Redis 記憶體七成防線等）、e2a0c12 |
| 6 推分支、開 PR | ✅ PR #5（未合併） |
