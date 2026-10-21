# ZeroGap 零空檔

規劃「電影＋餐廳＋交通」的約會行程：選好商圈、出發點、時間和預算，系統排出每一段都接得上的前三名方案。

## 資料夾

| 資料夾 | 內容 |
|---|---|
| `backend/` | 後端：FastAPI ＋ PostgreSQL（PostGIS）＋ Redis（RQ）。`app/` 程式、`tests/` 測試、`migrations/` 資料庫結構 |
| `frontend/` | 前端：React（組員維護，有自己的 git） |
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
