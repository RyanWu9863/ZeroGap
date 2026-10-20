# 後端第一階段實作計畫：從頭跑到尾的最小版本

> 依據：`docs/backend-spec.md` v0.11。日期：2026-10-20。
> 目標：10/27 前讓前端 ZeroGap 能串真的 API。資料用標「示意」的種子資料，Jev、TDX、Google 先用模擬版，Ollama 用本機的。
> 執行方式：在主 session 依序做（inline）；純邏輯一律先寫測試（TDD）；每個任務做完就 commit。

## 0. 範圍

**第一階段要做**：
- 專案骨架、設定、Docker Compose
- 資料表與 migration、示意種子資料
- Redis 共用元件：鎖、限流、額度、快取
- 模擬版的 TDX、Jev、Google；本機 Ollama 加模擬版備援
- 規劃流程 7 個步驟
- RQ 規劃工作、Pub/Sub 進度
- REST API：選單資料、coverage、狀態列、健康檢查、`POST /api/plans`（SSE）

**留到第二階段**：
- 真的 TDX、Google Places、Jev 用戶端（金鑰到了才做）
- 開眼、OSM、TDX 車站與地理編碼的爬蟲，匯入，寫入時的 Jev 判斷
- `rq cron` 排程
- MCP（`/mcp`）

## 1. 檔案設計

```
pyproject.toml             # uv 管理；Python 3.13
.env.example
docker-compose.yml         # name: zerogap（資料夾改名也不影響 volume）
Dockerfile                 # api、worker、cron 共用
deploy/nginx.conf          # proxy：SSE 不緩衝、X-Forwarded-For
alembic.ini
migrations/                # Alembic
app/
  main.py                  # FastAPI 進入點，掛 /api
  config.py                # pydantic-settings
  db.py                    # 非同步、同步各一個 engine
  models/                  # SQLAlchemy 2.0 + GeoAlchemy2
  schemas/                 # Pydantic：請求、回應、SSE 事件
  api.py                   # REST 端點
  services.py              # API 與（之後的）MCP 共用
  planner.py               # 規劃流程的指揮：讀資料 → 7 個步驟 → 結果
  planning/                # 規劃的純邏輯，不碰資料庫、網路
    rules.py               # 時間規則、步行、票價、餐費
    feasibility.py         # 步驟 3：篩出接得上的組合、計數被排除的原因
    choose.py              # 步驟 4：組 Jev 題目、合併分數、LLM 代選
    timeline.py            # 步驟 7：時間軸、緩衝、return_window
    highlights.py          # 特色標籤
    alternatives.py        # 備選的估計值
  transit.py               # 步行估算、TDX 介面、模擬版 TDX、路線快取
  jev/
    base.py                # 介面
    mock.py                # 模擬版
  llm.py                   # 本機 Ollama；連不上或逾時就採用 Jev 最高的選項
  places.py                # Google Place Details 介面與模擬版
  seed/
    demo.py                # 示意種子資料（python -m app.seed.demo）
  jobs/
    plan_job.py            # RQ 的規劃工作
  redis_utils/
    lock.py  ratelimit.py  quota.py  cache.py
tests/
  unit/                    # 純邏輯，不需要 Docker
  integration/             # 需要 PostgreSQL、Redis（docker compose）
```

**模擬版的設計**（都標成示意，結果固定、可重現）：
- **TDX**：直線距離 × 1.4 當路程，時速 30 公里，再加 5 分鐘；每 10 分鐘一班（整點、10 分……）；車資 15 元＋每公里 2 元，四捨五入到 5 元。兩端都是台鐵站就叫「台鐵」，否則叫「公車」。`top=3` 時回傳連續三班。
- **Jev**：依題目的 `state` 給每個選項打分數（例如料理類別符合 +2、適合約會 +1、步行越短越高），再用 softmax 換成機率。選項多時最高機率常常低於 0.6，跟真的 Jev 一樣會觸發 LLM 代選。
- **TDX 補充**（實作時新增）：05:30～23:50 發車，深夜沒車，「末班車」的排除才測得出來；只回傳要求時間前後 3 小時內的班次；影城、餐廳那一端要走 5 分鐘到站牌。
- **Jev 補充**（實作時新增）：每個選項加一點固定的小差異（代碼的 CRC32），避免屬性一樣時機率完全相同。
- **Google**：示意資料的餐廳來源標 `demo`，所以第一階段不會呼叫 Google；`places.py` 只放介面和模擬版。

**種子資料**（`app/seed/demo.py`，名稱一律帶「示意」）：
- 縣市：桃園市、臺北市、新北市。
- 商圈與代表點：規格書 4.3 的 4 個商圈、5 個代表點。
- 出發站約 12 個：桃園市的台鐵、高鐵、機捷站，加上臺北、板橋。
- 影城每個商圈 1～2 家，名稱是「示意影城 桃園 A」這種，品牌直接指定。
- 電影 6 部。
- 場次：今天起 7 天，每家影城每天約 12 場；第 4 天故意空著，讓前端測「沒資料的日子灰掉」。
- 餐廳每個商圈約 15 家，`source = 'demo'`，店名和營業時間存在 `osm_name`、`osm_opening_hours`，Jev 屬性直接填好。

> `restaurants.source` 新增 `demo` 給示意資料，CHECK 約束一樣只限制 `google`。已寫進規格書 v0.11。

## 2. 任務

每個任務都寫明：改哪些檔案、要通過的測試、驗證指令、commit 訊息。驗證指令在 `D:\ZeroGap` 執行。

### A. 骨架

- [x] **A1 建 git 與 .gitignore**
  - 檔案：`.gitignore`（`.venv/`、`.env`、`__pycache__/`、`frontend/`、`frontend-patches/`、`.pytest_cache/`）
  - 驗證：`git status` 看不到 `frontend/`
  - commit：`chore: 建立 git 與 .gitignore`
- [x] **A2 pyproject 與套件**
  - 相依套件：`fastapi`、`uvicorn[standard]`、`pydantic-settings`、`sqlalchemy[asyncio]>=2`、`geoalchemy2`、`alembic`、`psycopg[binary]>=3`、`redis>=5`、`rq==2.12.*`、`httpx`。
  - 開發用：`pytest`、`pytest-asyncio`、`respx`、`ruff`。
  - 驗證：`uv sync`、`uv run python -c "import fastapi, rq, geoalchemy2"`
  - commit：`chore: pyproject 與相依套件`
- [x] **A3 設定** `app/config.py`
  - `Settings` 讀 8.2 的環境變數，另外加 `TDX_MODE`、`GOOGLE_MODE`（`real|mock`，預設 `mock`）和 `LLM_MODE`（`ollama|mock`）。時間規則的預設值照規格書 10.1。
  - 測試 `tests/unit/test_config.py`：沒設環境變數時，`settings.wait_minutes == 10`、`settings.meal_minutes == {"fast": 45, "normal": 75, "slow": 105}`、`settings.jev_min_top_probability == 0.6`。
  - commit：`feat(config): 環境變數與時間規則預設值`
- [x] **A4 Docker Compose 與 Dockerfile**
  - 服務：`postgres`（`postgis/postgis:16-3.4`）、`redis`（`redis:7`，照 5.1 設定）、`api`、`worker`、`proxy`。
  - `ollama` 放在 `demo` profile：開發時用本機 Ollama，`OLLAMA_BASE_URL=http://host.docker.internal:11434`。
  - `cron` 第二階段才加。
  - 驗證：`docker compose config` 沒有錯；`docker compose up -d postgres redis` 後兩個都是 healthy。
  - 實作備註：本機的 5432 已經有別的 PostgreSQL，compose 的 PostgreSQL 對外改用 5433；proxy 對外開 8000，對上前端 Vite 的 `/api` 轉發。PostGIS 用 `16-3.5`。
  - commit：`chore(docker): compose 與 Dockerfile`

### B. 規劃的純邏輯（TDD，不需要 Docker）

每個函式都先寫失敗的測試，跑一次確認是因為「還沒實作」而失敗，再寫實作。

- [x] **B1 `planning/rules.py`**
  - `walk_minutes(meters: float) -> int`：直線距離 × 1.3 ÷ 75，無條件進位。測試：`walk_minutes(0) == 0`、`walk_minutes(300) == 6`（390 ÷ 75 ＝ 5.2，進位成 6）。
  - `max_straight_meters(minutes: int) -> float`：分鐘 × 75 ÷ 1.3。
  - `estimate_ticket(chain, hall_type, prices) -> int`：照 4.3 的查詢順序，取中間值後四捨五入到 10 元。測試：威秀一般廳 350、威秀 `imax` 440（435 進位）、秀泰 `imax` 退回秀泰一般廳 360（355 進位）、品牌是 `None` 時用 `default` 330（325 進位）。
  - `meal_cost(price_range) -> int`：150、350、750、1,200。
  - `last_order(close_time) -> time`：打烊前 30 分鐘。
  - commit：`feat(planning): 時間、步行、票價、餐費規則`
- [x] **B2 `planning/feasibility.py`（先看電影）**
  - 輸入：`Showtime`、`Restaurant`（含最近代表點和步行分鐘數、營業時間）、`Reach`（每家影城最早幾點能到、去程車資）、`Leave`（每個代表點最晚幾點要離開、回程車資）、使用者條件。
  - 輸出：`Combo`（各時間點、各段緩衝、每人花費）或 `Rejected(reason)`。
  - 被排除的原因照規格書 6.4 的表：`showtime`、`walk`、`opening_hours`、`last_order`、`last_train`、`budget`。依這個順序檢查，第一個不符合的就是原因。
  - 測試用規格書 6.5 的範例數字：
    - 17:30 到影城、17:55 開演 → `showtime` 緩衝 10。
    - 散場 19:54、步行 3、候位 10 → 20:07 開始用餐；最後點餐 21:00 → `last_order` 緩衝 53。
    - 快速用餐 45 分鐘，20:52 吃完；走 5 分鐘，20:57 到桃園站；最晚要離開 22:28 → `return_trip` 緩衝 91。
    - 每人花費 350＋150＋25＋25＝550。
  - 另外每個排除原因各一個測試，再加一個跨午夜到家的測試。
  - commit：`feat(planning): 先看電影的可行性檢查`
- [x] **B3 先吃飯**：同一個模組加 `check_meal_first`。測試：最晚要離開改看影城，`return_trip` 緩衝放在 `movie`。
  - commit：`feat(planning): 先吃飯的可行性檢查`
- [x] **B4 `filter_all`**：所有「場次 × 餐廳」逐一檢查，回傳可行的組合加上 `reasons` 計數；同一組「電影 × 餐廳」有多個場次時，留最緊緩衝最大的一場。
  - 測試：計數加總等於組合總數；重複組合只留一場。
  - commit：`feat(planning): 篩選全部組合與排除原因計數`
- [x] **B5 `planning/choose.py`**
  - `build_movie_question`、`build_restaurant_question`：最多 10 個選項，排序照 7.1 步驟 4。
  - `rank_combos(probs_movie, probs_restaurant, combos) -> list[Ranked]`：分數＝P(電影)×P(餐廳)，取前 3；使用者指定電影時選片機率當作 1。
  - `needs_llm(probs) -> bool`：最高機率低於 0.6。
  - `apply_llm_pick(...)`：含 LLM 選中選項的方案排到第一名，其他候選放進 `alternatives`（最多 2 個）。
  - commit：`feat(planning): Jev 題目、排名、LLM 代選`
- [x] **B6 `planning/timeline.py`**
  - 從 `Combo` 和精確路線組出 6.5 的時間軸：每一步的 `place`，有關卡的步驟加 `buffer_minutes`、`buffer_gate`，`return_trip` 那一步加 `return_window`。
  - 測試：照 6.5 範例比對整條 JSON。
  - commit：`feat(planning): 時間軸、緩衝與 return_window`
- [x] **B7 `planning/highlights.py`**
  - 測試：第一名一定是 `recommended`；第二、三名照規則分配；同分；一項都沒有時是 `None`。
  - commit：`feat(planning): 特色標籤分配`
- [x] **B8 `planning/alternatives.py`**
  - 照 7.1 步驟 7 估到家時間和花費，`estimated=True`。
  - 測試：餐廳備選、電影備選（同一家餐廳接不上時，改用分數最高的可行餐廳）。
  - commit：`feat(planning): 備選的估計值`

### C. 外部服務的介面與模擬版（TDD）

- [x] **C1 `transit.py` 模擬版 TDX**
  - `route(origin, dest, at, mode, top) -> list[Route]`。
  - 測試：`depart` 時回傳的出發時間不早於要求的時間；`arrival` 時抵達時間不晚於要求的時間；`top=3` 回傳 3 條；結果固定。
  - commit：`feat(transit): 模擬版 TDX`
- [x] **C2 `jev/mock.py`**
  - 測試：機率加總是 1；同樣的輸入得到同樣的輸出；10 個選項的平均情況下最高機率低於 0.6。
  - commit：`feat(jev): 模擬版 Jev`
- [x] **C3 `llm.py`**
  - 用 `httpx` 呼叫 Ollama 的 `/api/generate`，請它從前 3 名選一個，回傳選項代碼。
  - 逾時、連不上、回傳的不是選項之一，都採用 Jev 機率最高的選項。
  - 測試：用 respx 模擬 Ollama，正常回答、亂答、逾時各一個。
  - commit：`feat(llm): Ollama 代選與逾時處理`

### D. 資料庫與種子資料（需要 Docker）

- [x] **D1 models 與第一個 migration**
  - 資料表照規格書 4.3。`restaurants.source` 允許 `demo`。加上 CHECK 約束、唯一鍵、GiST 索引。
  - 驗證：`docker compose up -d postgres`、`uv run alembic upgrade head`、`uv run alembic downgrade base` 都成功。
  - commit：`feat(db): 資料表與第一個 migration`
- [x] **D2 種子資料** `app/seed/demo.py`
  - 驗證：執行兩次結果一樣（UPSERT）；`SELECT count(*) FROM showtimes` 大於 0。
  - 整合測試：`source = 'google'` 的餐廳寫入 `osm_name` 時，會被 CHECK 約束擋下。
  - commit：`feat(seed): 示意種子資料`
- [x] **D3 PostGIS 查詢**：步行範圍內的餐廳、每家餐廳最近的代表點（4.4 的兩個 SQL）。
  - 整合測試：用種子資料驗證距離和對應的代表點。
  - commit：`feat(db): PostGIS 查詢`

### E. Redis 共用元件（需要 Docker）

- [x] **E1 `ratelimit.py`**：5.5 的滑動窗口 Lua script。整合測試：窗口內第 6 次被擋，窗口過了又可以。
- [x] **E2 `lock.py`**：取得、延長、比對值才釋放。整合測試：別人的鎖刪不掉。
- [x] **E3 `quota.py`**、**E4 `cache.py`**（兩個都完成）（路線快取：`depart` 往後、`arrival` 往前取整到 15 分鐘）。
  - 單元測試：18:07 算成 18:15、22:58 算成 22:45（取整單位 15 分鐘）。
  - commit：每個元件各一個

> 規格書 5.3 原本的範例寫「18:07 算成 18:10」，跟 15 分鐘的取整單位不符，v0.11 已改成 18:15。

### F. 規劃流程與 RQ

- [x] **F1 `planner.py`**：把步驟 1～7 串起來，每個步驟呼叫 `progress(stage, **data)`。
  - 整合測試：用種子資料和模擬版跑一次完整規劃，結果通過 `schemas` 的驗證；把預算設成 100 時回 `NO_FEASIBLE` 和 `reasons`。
- [x] **F2 `jobs/plan_job.py`**：在 worker 中執行規劃，進度和結果 `PUBLISH` 到 `plan:{job_id}:events`。
- [x] **F3 排隊上限與取消**：5 個在等就回 `QUEUE_FULL`；在佇列裡超過 15 分鐘作廢；使用者斷線時，排隊中的移除、執行中的停止。

### G. REST API

- [x] **G1 `schemas/`**：照 6.3～6.5 定義全部的 Pydantic 模型。
- [ ] **G2 選單端點**：`/api/counties`、`/api/areas`、`/api/stations`、`/api/categories`、`/api/coverage`（含 `available_dates`）、`/api/status`、`/api/health`。
- [ ] **G3 `POST /api/plans`**：
  - 先訂閱 Pub/Sub 再排進佇列；轉成 SSE。
  - 帶 `X-Accel-Buffering: no`，每 15 秒送一次心跳。
  - 限流照 5.5：409、429、503。
- [ ] **G4 錯誤格式與 CORS**：照 6.1。
- [ ] **G5 端對端驗證**：`docker compose up` 後，用 `curl -N` 打 `POST /api/plans`，看到 `queued`、`progress`、`result` 依序出現。

## 3. 完成的定義

- `uv run pytest tests/unit` 全部通過。
- Docker 跑起來後，`uv run pytest tests/integration` 全部通過。
- G5 的 `curl` 看得到完整的 SSE 事件，結果格式符合規格書 6.5。
- 前端 `VITE_USE_MOCK=false` 時，可以在本機排出一次行程。這一項要等前端那個 session 改好才能驗。
