# 子專案 ①「連結取餐號」：設計規格

> 2026-11-07｜狀態：已核准、已實作（2026-11-07）｜上層規格：`docs/superpowers/specs/2026-11-07-frontend-redesign-design.md`（D4、D5、第 7 節；那份目前在 PR #3 的分支上）
> 範圍：**後端＋MCP＋規格書**。前端的分享頁 `/p/:id` 在前端第 4 批做，這裡只定好介面。

## 1. 要解決什麼

使用者在 AI 助理（Claude 等）裡用一句話排行程，MCP 的 `plan_date` 回傳結果。現在只有文字，看不到時間軸和緩衝。

做法（D5，取餐號碼牌）：排好的結果由**後端存起來**，給一個編號；MCP 回傳時附上連結 `https://<網站>/p/<編號>`，點開就是網頁上的**同一份**行程。網頁自己排好時也用同一個連結分享。

**成功的樣子**
- 同一份行程：連結打開的內容，跟當初 SSE `result` 事件、MCP 回傳的內容一模一樣（不重排）。
- 7 天內打得開；過期或亂打的編號，回清楚的 404。
- 存檔失敗（例如 Redis 滿了）不影響規劃本身：使用者照樣拿到結果，只是沒有連結。

## 2. 已確定的決定

| # | 決定 | 來源 |
|---|---|---|
| S1 | 後端存結果、連結帶編號（不重排、不把整份塞進網址） | 2026-11-07 使用者（上層 D5） |
| S2 | 編號就是 `job_id`（32 碼小寫十六進位亂數，猜不到）；保留 7 天 | 上層規格第 7 節 |
| S3 | 用「目前位置」出發時，**座標照原樣存**；前端分享時提醒「連結會包含你的出發位置」 | 2026-11-07 使用者 |
| S4 | 分支從 `main` 開，獨立一個 PR；`mcp.py` 只改回傳那幾行，跟 PR #1、#2 的重疊越小越好 | 2026-11-07 使用者 |
| S5 | 只存**排出來的結果**；`NO_FEASIBLE` 等錯誤不存 | 本規格 |
| S6 | `PUBLIC_WEB_BASE_URL` 沒設定時，MCP 不附 `share_url`（本機開發時不會給出打不開的連結） | 本規格 |

## 3. 設計

### 3.1 在哪裡存

`plan_stream.plan_events` 收到 worker 送來的 `result` 事件時，**在把結果交出去之前**寫進 Redis。`POST /api/plans`（SSE）和 MCP `plan_date` 都走 `plan_events`，所以一個地方就涵蓋兩條路。

- Key：`plan:{job_id}:saved`，string（JSON），過期 `SAVED_PLAN_TTL_SECONDS`（預設 604800＝7 天）。
- 內容：
  ```json
  {
    "job_id": "8f3a…",
    "request": { …當初送出的 PlanRequest（model_dump(mode="json")）… },
    "result": { …SSE result 事件的 data，原封不動… },
    "created_at": "2026-11-07T21:03:00+08:00",
    "expires_at": "2026-11-14T21:03:00+08:00"
  }
  ```
- 寫入失敗（任何 `redis.RedisError`）只記 warning 日誌，**照樣交出結果**。
- 大小：一份約 15 KB（實測：3 個方案的結果約 14.6 KB，加上請求）。最壞情況：每個 IP 每小時最多 10 次規劃（5.5），7 天最多約 1,680 份、約 25 MB；全站受限於單一 `plans` worker 的速度，一週約 9,450 份，約 140～380 MB，已可能超過 Redis 256 MB（5.1，`noeviction`）。Redis 滿了會讓限流等所有寫入失敗、整個 API 回 503，所以 `save_plan` 先看記憶體：用量超過 `maxmemory` 的 70%（`SAVED_PLAN_MAX_MEMORY_RATIO`，預設 0.7；`maxmemory` 為 0 表示沒限制就不檢查）就跳過這次存檔，只記 warning、照樣交出結果、不附連結，把剩下的空間留給限流和佇列。公開上線前要再檢討（縮短保存天數或限制筆數）。

### 3.2 怎麼讀：`GET /api/plans/{job_id}`

- 限流：跟其他查詢一樣（`rl:api:read:{IP}`，每分鐘 60 次）。
- `job_id` 不是 32 碼小寫十六進位 → 404 `NOT_FOUND`（不碰 Redis）。
- 找不到（過期或從來沒有）→ 404 `NOT_FOUND`，訊息「找不到這份行程，可能已經超過 7 天」。
- 找到 → 200，回傳 3.1 的整份內容（`SavedPlanOut`）。`request`、`result` 用 `dict` 原樣回傳，不再用目前的 Pydantic 模型驗一次：7 天內後端可能改版，舊資料不該因為新版驗證而打不開；前端用 zod 驗。
- 不回傳「過期了沒」的判斷：前端用 `expires_at` 和行程日期自己判斷（上層規格 3.3）。

### 3.3 MCP

- `plan_date` 拿到結果時，回傳 `{…結果, "share_url": "<PUBLIC_WEB_BASE_URL>/p/<job_id>"}`；沒設定 `PUBLIC_WEB_BASE_URL` 時不加這個欄位。
- 工具說明（docstring）加一句：「回傳的 share_url 是網頁版連結，請一併給使用者，點開可以看完整的時間軸和每段緩衝」。
- 存檔失敗時還是附 `share_url`？**不附**：`plan_events` 會告訴呼叫端有沒有存成功（見 3.4），避免給出打不開的連結。

### 3.4 程式結構

新檔 `backend/app/saved_plans.py`（一個檔案一件事：存、讀、組網址）：
- `JOB_ID_RE`：`^[0-9a-f]{32}$`
- `saved_key(job_id) -> str`
- `async save_plan(r, s, job_id, request, result, now) -> bool`：寫入成功回 `True`，Redis 出錯回 `False`（不丟例外）
- `async load_plan(r, job_id) -> dict | None`
- `share_url(s, job_id) -> str | None`：`PUBLIC_WEB_BASE_URL` 去掉結尾 `/` 後接 `/p/{job_id}`；沒設定回 `None`

`plan_events` 在 `result` 事件的 `data` 裡**不加**任何欄位（SSE 的格式不變）；改成在交出 `result` 前呼叫 `save_plan`，並把成功與否記在 generator 外可讀的地方：新增 `plan_events(..., on_saved: Callable[[bool], None] | None = None)`，MCP 傳一個回呼收結果。

設定（`app/config.py`）：`saved_plan_ttl_seconds: int = 7 * 24 * 3600`、`public_web_base_url: str = ""`。`.env.example` 加說明。

### 3.5 規格書與紀錄

- `docs/backend-spec.md` 升到 **v0.21**（v0.19、v0.20 已被 PR #1、#2 用掉；誰後合併誰調版本號）：5.2 Key 一覽、6.2 端點一覽、新增 6.8「`GET /api/plans/{job_id}`」、6.6 MCP `plan_date` 回傳、8.2 環境變數、10.1 預設值（7 天）。
- `docs/spec-discussion.md` 加一節「2026-11-07 分享連結（規格書 v0.21）」：決定 S1～S6 與理由（團隊 CLAUDE.md 規定改規格要同步）。

## 4. 測試

- **單元**（`tests/unit/test_saved_plans.py`，不需要 Docker）：`share_url` 有／沒設定、結尾斜線；`JOB_ID_RE` 擋掉大寫、長度不對、路徑字元。
- **整合**（需要 `docker compose up -d postgres redis`）：
  - `test_plan_stream.py`：`result` 事件交出前已經存好（讀 Redis 有內容、TTL 約 7 天）；`error` 事件不存；Redis 寫入失敗時照樣交出結果、`on_saved(False)`。
  - `test_api.py`：端到端 `POST /api/plans` 後 `GET /api/plans/{job_id}` 拿到同一份 `result`；壞格式編號 404、不存在 404；限流沿用 `read_limit`。
  - `test_mcp.py`：設定 `PUBLIC_WEB_BASE_URL` 時 `plan_date` 回傳有 `share_url` 且編號能用 `GET` 讀到；沒設定時沒有這個欄位。
- 全部：`cd backend && uv run pytest`（整合測試要先開 Docker）＋`uv run ruff check`。

## 5. 不在這次範圍

- 前端分享頁 `/p/:id`、zod schema、假伺服器存結果、分享時的位置提醒：前端第 4 批。
- 合約檢查工具 `tools/contract-check/` 加入 `saved_plan`：前端第 4 批有 zod schema 時一起加。
- 正式網站的 `PUBLIC_WEB_BASE_URL` 要填什麼：後端上線不在範圍內（上層 D12）；Demo 時填本機前端網址，例如 `http://localhost:5173`。
- 手動刪除分享、統計點閱。

## 6. 開工前

- 使用者先跟 ②（後端組員）說一聲：會改 `plan_stream.py`、`api.py`、`mcp.py`、`config.py`、規格書。
- 本機要開 Docker Desktop，跑 `docker compose up -d postgres redis` 才能跑整合測試（不需要 TDX、Google 金鑰；測試一律用模擬版）。
