# ZeroGap 零空檔：後端

專案名稱是 **ZeroGap 零空檔**，跟前端一樣（2026-10-20 使用者決定，不再用「約會一條龍」）。我們和使用者一步一步設計了後端規格（FastAPI ＋ PostgreSQL ＋ Redis），2026-10-20 起開始實作。這是專題報告，要展示給廠商看。

## 資料夾

- `backend/`：後端程式（`app/`、`tests/`、`migrations/`、Dockerfile、`pyproject.toml`）。後端的指令在 `backend/` 裡執行，或在根目錄用 `uv run --directory backend …`。
- `frontend/`：前端（組員的 React）。2026-10-22 起和後端放在同一個 git（前端原本的歷史保留在 merge commit 裡），推到 https://github.com/RyanWu9863/ZeroGap（2026-10-27 起公開）。前端展示版（假資料）在 https://ryanwu9863.github.io/ZeroGap/ ，`frontend/` 推到 main 就由根目錄的 `.github/workflows/pages.yml` 自動發布。
- `docs/`：規格書、討論紀錄、手冊、架構圖（舊版在 `架構圖/舊版/`）、`報告/`（簡報）。
- `tools/`：前後端合約檢查、組員網頁的產生工具。
- 根目錄：`docker-compose.yml`、`deploy/nginx.conf`、`.env`（金鑰，不進 git）。

## 開始前一定要先讀

- [docs/spec-discussion.md](docs/spec-discussion.md)：完整的討論紀錄，包括所有已確定的決定、查證過的外部服務資料、待解決事項和剩下的步驟。**一切以這份為準。**
- [docs/架構圖/architecture-original.webp](docs/架構圖/architecture-original.webp)：最初的架構圖。部分內容已過時，變更清單在紀錄的第 2 節。
- [docs/架構圖/architecture-v0.4.svg](docs/架構圖/architecture-v0.4.svg)：依規格書 v0.4 重畫的架構圖，另有 PNG 版。規格書改動時，要同步修改這個 SVG，再用 headless Chrome 重新轉出 PNG。

## 工作方式（使用者的要求）

- 一步一步討論，每輪問 4～6 題，用表格列出選項和影響。
- **不懂就問，不要替使用者做決定。** 使用者明確說「幫我決定」時才代為決定，並說明理由。
- 牽涉外部服務（TDX、Google Places、TypeSafe Jev、套件現況）時，先查官方文件再回答。
- 用繁體中文。
- 每輪得到答案後，更新 `docs/spec-discussion.md`，讓紀錄跟著進度走。

## 目前進度（2026-10-21）

- **第二階段（2026-10-21）**：使用者最後決定留在原本的電腦。TDX（真的）、車站、OSM 餐廳、開眼爬蟲、`rq cron`、MCP 都做好了。Google Places 用測試金鑰實測過（`GOOGLE_MODE=real`，4 個商圈共 381 家，只存 `place_id` 和座標），真的資料端到端排得出行程。剩 Jev（等金鑰）。進度和待問的問題在 `docs/plans/2026-10-20-backend-phase2.md` 和討論紀錄最後幾節。[交接文件](docs/交接_後端第二階段.md) 留著，換電腦時照它做（裡面的進度是 10/20 的）。

- **規格書目前是 v0.19**（v0.19 mcp-eval 端到端修正：影城走不到餐廳時 coverage 不列、規劃說明影城太遠；TDX 200 公尺內直接走路、1 公里內逾時改走路；MCP 錯誤附 reasons，分支 `fix/mcp-e2e-unreachable-cinema-and-tdx-timeout`；v0.18 合併組員的 MCP 工具介面改良：參數說明、`origin_station_name`、MCP 走路上限預設 12、MCP 專用錯誤 `AMBIGUOUS`、`/api/coverage` 新增 `cuisines`，分支 `feat/mcp-tool-descriptions`；v0.17 Google 座標更新失敗時 404 才馬上停用、暫時的錯誤隔天再試；v0.16 交通接不上時 `reasons` 只放 `transit_window`、TDX 回程往前重查、去程取最早抵達；v0.15 AI 推論：決策紀錄、Router 判斷方式可切換、LLM 熔斷與棄權，分支 `feat/ai-inference-reliability` 2026-10-27 合進 main；v0.14 規劃和抓取拆成 `worker`、`worker-crawl` 兩個容器；v0.13 第二階段實作；v0.12 逐項確認實作時新增的預設值；v0.11 補上示意資料的 `demo` 來源、修正快取取整範例；v0.7 對照 `初步簡報.pdf` 並做過一致性檢查；v0.8～v0.10 對照組員的前端 ZeroGap 調整）：[docs/backend-spec.md](docs/backend-spec.md)。使用者要趕進度，所以未決定的項目先用預設值寫入，標記為【預設】，整理在第 10 節。
- **前端 ZeroGap**（組員做的 React 前端，原本照另一份 `docs/API.md` 寫成）：使用者決定前端改照我們的規格書串接。串接說明在規格書 6.7；對照經過在討論紀錄的「對照前端 ZeroGap」一節。飲食限制這一版不做，設計留在規格書附錄 A。
- **前端改接完成**（2026-10-21，另一個 session 做的）：程式在 `frontend/`（原本是前端自己的 git、分支 `feature/backend-v0.9`，2026-10-22 合進 main 後併進這個 repo）。交接用的補丁 `frontend-patches/` 已刪掉（2026-10-21 使用者決定）。我們請前端做的三件事都完成，也用 `VITE_USE_MOCK=false` 接本機後端實際排過。主 session 不要動 `frontend/`。還沒驗證：前端的 Docker 版本接後端 compose（要設 `BACKEND_URL`）、Google 來源餐廳在前端的顯示。前後端合約檢查：`tools/contract-check/`。
- **後端第一階段完成**（2026-10-20）：照 [實作計畫](docs/plans/2026-10-20-backend-phase1.md) 做完 A～G，示意資料＋模擬版 TDX、Jev、Google，本機 Ollama（qwen2.5:3b）。`docker compose up -d --build` 後 `uv run --directory backend python -m app.seed.demo` 寫入示意資料，API 在 `localhost:8000`（文件 `/api/docs`）。測試：在 `backend/` 執行 `uv run pytest`（整合測試要先開 Docker）。
- **Demo 操作手冊**：[docs/Demo操作手冊.md](docs/Demo操作手冊.md)；Demo 前跑 `uv run --directory backend python -m app.jobs.check`。
- 規格書 10.1 實作時新增的預設值，2026-10-20 已和使用者逐項確認完（三輪，紀錄在討論紀錄）。
- 接下來可能的工作：
  - 逐項調整【預設】的值
  - 確認仍是預設值的項目：其他 3 個商圈的代表點、片型主清單
  - 處理【實作前確認】的項目
  - Jev 金鑰到了之後實測（用戶端已照官方文件寫好）
  - 前端的 Docker 版本接後端 compose；Google 來源餐廳在前端的顯示
  - TDX 票價 API（使用者決定 Demo 之後再做）
- **實測注意**：TDX 每分鐘只能查 5 次，前後端不要同時實測；除錯時直接呼叫 TDX 也要經過限流器，不然會 429。
- 修改規格書時，同步更新 `docs/spec-discussion.md`。
- **給組員看的網頁**：https://claude.ai/artifact/LzNC6Q716vraixUuoDsFKY
  - 架構圖的 PNG 用 headless Chrome 轉：寫一個用 `<img>` 載入 SVG 的 HTML，`chrome.exe --headless=new --force-device-scale-factor=2 --window-size=1340,1320 --screenshot=...`，輸出 2680×2640。
  - 規格書改版後，用下面的指令重新產生網頁，再用 Artifact 工具發布到同一個網址（帶 `url`，連同 `architecture-v0.4.png`）。
  - 指令：`uv run --no-project --with markdown python tools/spec-page/build_spec_page.py docs/backend-spec.md <輸出的 index.html> tools/spec-page/spec_template.html`
- **commit 時只 add 自己改的檔案**，不要用 `git add -A`：2026-10-21 曾把別的工作產生的簡報檔誤 commit 進來。
