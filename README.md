# ZeroGap 零空檔

規劃「電影＋餐廳＋交通」的約會行程：選好商圈、出發點、時間和預算，系統排出每一段都接得上的前三名方案。

前端展示版（假資料，只有前端）：https://ryanwu9863.github.io/ZeroGap/

## 資料夾

| 資料夾 | 內容 |
|---|---|
| `backend/` | 後端：FastAPI ＋ PostgreSQL（PostGIS）＋ Redis（RQ）。`app/` 程式、`tests/` 測試、`migrations/` 資料庫結構 |
| `frontend/` | 前端：React ＋ Vite（組員維護）。說明見 [frontend/README.md](frontend/README.md) |
| `deploy/` | nginx 設定（反向代理、SSE、`/mcp`） |
| `docs/` | 規格書 `backend-spec.md`、討論紀錄、Demo 操作手冊、架構圖、`報告/` |
| `tools/` | 前後端合約檢查（`contract-check/`）、規格書網頁產生工具（`spec-page/`） |
| `docker-compose.yml` | 整套服務：migrate、api、worker（規劃）、worker-crawl（抓取）、cron、proxy、postgres、redis |

## 快速開始

1. 複製 `.env.example` 成 `.env`，填入 TDX、Google 的金鑰（不要 commit）。
2. 啟動：`docker compose up -d --build`，API 在 `http://localhost:8000/api/docs`。
3. 檢查能不能 Demo：`uv run --directory backend python -m app.jobs.check`
4. 測試：在 `backend/` 執行 `uv run pytest`（整合測試要先開 Docker）。

詳細的操作見 [docs/Demo操作手冊.md](docs/Demo操作手冊.md)，設計見 [docs/backend-spec.md](docs/backend-spec.md)。

## 組員用模擬版測 LLM

TDX、Google、Jev 都用模擬版、只有 LLM 用真的（本機 Ollama），不需要任何金鑰。Jev 的模擬版機率很分散，大部分題目都會交給 LLM 代選，適合測 LLM。

### 不要共用金鑰

**不要把 TDX、Google 的金鑰拿來自己的電腦用。** 限流和每月額度記在各自電腦的 Redis 裡，兩台電腦不會互相知道：

- TDX：兩台加起來會超過每分鐘 5 次，兩邊都一直收到 429。
- Google：兩台各自算到 950 次才停，加起來會超過每月免費的 1,000 次，**會產生費用**。

要用真的服務，請自己申請金鑰。

### 步驟

需要先裝好 Git、[Docker Desktop](https://www.docker.com/products/docker-desktop/)、[uv](https://docs.astral.sh/uv/)、[Ollama](https://ollama.com/)。repo 是公開的，直接 clone 就好；要推程式回來，請 RyanWu9863 把你加成 collaborator。

1. 下載 LLM 模型（約 2 GB），確認 Ollama 有在跑：
   ```bash
   ollama pull qwen2.5:3b
   ```
   Ollama 用預設設定就好：Docker Desktop 的容器透過 `host.docker.internal` 連得到本機的 Ollama。
2. clone 後在專案根目錄複製設定檔。`.env.example` 預設就是模擬版（`TDX_MODE`、`GOOGLE_MODE`、`JEV_MODE` 都是 `mock`，`LLM_MODE=ollama`），不用改：
   ```bash
   cp .env.example .env
   ```
3. 啟動：
   ```bash
   docker compose up -d --build
   ```
   `worker-crawl` 的日誌會有幾個錯誤（TDX 車站、開眼、OSM 抓不到）：模擬版不能抓真的資料，不影響下一步。
4. 寫入示意資料（桃園區、中壢、八德的影城、場次、餐廳；場次從今天起 7 天，其中第 4 天故意沒有場次）：
   ```bash
   uv run --directory backend python -m app.seed.demo
   ```
   場次是從執行那天起算的，過幾天要再執行一次。`uv run --directory backend python -m app.jobs.check` 在模擬版會顯示幾項「失敗」（開眼、OSM、TDX 車站從沒抓過；蘆竹沒有資料），是正常的。
5. 送一次規劃。打開 `http://localhost:8000/api/docs` 試 `POST /api/plans`，或用 curl（`origin_station_id` 用 `GET /api/stations?county=Taoyuan` 查中壢站的 id；`date` 改成明天）：
   ```bash
   curl -N -X POST http://localhost:8000/api/plans -H "Content-Type: application/json" -d "{\"area\":\"zhongli\",\"origin_station_id\":3,\"date\":\"2026-10-28\",\"earliest_departure\":\"17:00\",\"latest_home\":\"23:30\",\"order\":\"movie_first\",\"budget_per_person\":1500,\"max_walk_minutes\":12}"
   ```
   約 1 分鐘。進度裡的 `llm_fallback` 就是交給 LLM 代選的題目。
6. 看每一題是誰決定的：worker 的日誌每次規劃有一行 `decision_trace`，記錄 Jev 的機率、有沒有交給 LLM、LLM 的狀態（`ok`、逾時……）和花的時間：
   ```bash
   docker compose logs worker | grep decision_trace
   ```

### 可以調的設定

改 `.env` 後執行 `docker compose up -d` 就會生效。完整清單見 `backend/app/config.py`。

| 設定 | 作用 |
|---|---|
| `OLLAMA_MODEL` | 換模型，例如 `qwen3:8b`（要先 `ollama pull`） |
| `LLM_ALLOW_ABSTAIN=true` | LLM 可以回答「無法判斷」，這時改用 Jev 機率最高的選項 |
| `ROUTER_POLICY`、`ROUTER_PARAM` | 判斷 Jev 有沒有把握的方式：`fixed`（預設）、`options`、`margin`、`entropy`，見規格書 3.1 |
| `API_PLAN_PER_HOUR` | 同一個 IP 每小時能規劃幾次（預設 10），大量測試時調高 |

LLM 相關的程式在 `backend/app/llm.py`（代選、熔斷、棄權）、`backend/app/planning/choose.py`（判斷有沒有把握）、`backend/app/decision_trace.py`（決策紀錄）；設計見規格書 3.1、7.1。改完程式在 `backend/` 執行 `uv run pytest`（整合測試要先開 Docker）。
