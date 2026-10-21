# ZeroGap 零空檔：Demo 操作手冊（後端）

> 2026-10-21 版。給 Demo 當天操作的人看。指令都在 `D:\ZeroGap` 執行。

## 1. Demo 前一天

1. **金鑰**：`.env` 裡有 `TDX_CLIENT_ID`、`TDX_CLIENT_SECRET`，`TDX_MODE=real`。
   - TypeSafe Jev 的金鑰還沒到：`JEV_MODE=mock`，狀態列會顯示「mock」。要跟廠商說明這一點，或在 Demo 前拿到金鑰。
2. **跑一次檢查**（見第 3 節），全部「OK」或只有「注意」就可以。
3. **場次只有今天到後天**：開眼只公布 2～3 天，系統每天 06:00、18:00 自動更新。Demo 的日期要選檢查結果「有場次的日期」裡的一天。
4. **電腦不要睡眠**：排程要 Docker 一直開著才會跑。

## 2. 開機順序（Demo 當天）

1. 開 **Docker Desktop**，等到左下角顯示 Engine running。
2. 確認 **Ollama** 有在跑（右下角工作列有圖示；或 `ollama ps`）。
3. 啟動全部服務：
   ```bash
   docker compose up -d --build
   ```
   - `--build` 不要省：程式或資料庫結構改過的話，舊的映像檔會讓 `migrate` 失敗，api 跟著起不來（症狀是網頁回 502）。
4. 等 10 秒，跑檢查：
   ```bash
   uv run python -m app.jobs.check
   ```
5. 開前端（照前端組員的說明）。前端開發模式會把 `/api` 轉到 `localhost:8000`。

## 3. 檢查結果怎麼看

`python -m app.jobs.check` 會列出每一項：

| 結果 | 意思 | 怎麼辦 |
|---|---|---|
| `[OK  ]` | 正常 | — |
| `[注意]` | 可以 Demo，但要知道 | 例如 Jev 是模擬版、店家屬性還沒判斷完（每天會補） |
| `[失敗]` | Demo 前要處理 | 看那一行後面的提示，常見的見第 5 節 |

最後一行是「可以 Demo」或「有 N 項失敗」。

## 4. Demo 可以展示的東西

| 展示 | 怎麼做 | 重點 |
|---|---|---|
| 排行程 | 前端選商圈、出發站、日期、時間、預算 → 送出 | 等待畫面會顯示排隊順位和進度（「28,416 種組合 → 633 種接得上」）；一次約 1～1.5 分鐘，因為 TDX 每分鐘只能查 5 次 |
| 三個方案 | 結果頁 | 每張卡有特色標籤（最推薦、最省、最穩、最早回到站、走最少路）、時間軸、每人花費（估計值有標示） |
| Jev 沒把握 | 結果頁的「換一部／換一家」 | Jev 最高機率低於 60% 時交給本機 LLM（qwen2.5:3b）代選，另外列出備選 |
| 真的交通 | 時間軸的搭車段 | 班次是 TDX 查的真實班次；台鐵的車資是估的（有標示） |
| API 文件 | 瀏覽器開 http://localhost:8000/api/docs | FastAPI 自動產生 |
| MCP | 用支援 MCP 的 AI 客戶端連 `http://localhost:8000/mcp` | 5 個工具：list_areas、list_stations、list_categories、data_coverage、plan_date；plan_date 會送出進度通知 |
| 三大技術 | 講解 | FastAPI（SSE、MCP）、PostgreSQL（PostGIS 算步行範圍、CHECK 約束守住 Google 條款）、Redis（RQ 佇列、限流、快取、Pub/Sub） |

**要說明的限制**
- 資料是**學術展示用**：場次來自開眼電影網、餐廳來自 OpenStreetMap（畫面上要標「© OpenStreetMap contributors」）。
- 店家的價位、用餐時間是本機小模型判斷的，不一定準。
- TDX 公告旅運規劃 API 會在 2026/12/31 下架，之後要換成開源的旅運規劃軟體。

## 5. 出問題時

| 症狀 | 原因 | 處理 |
|---|---|---|
| 網頁或 API 回 **502** | api 容器沒起來，多半是 `migrate` 失敗 | `docker compose up -d --build`；還是不行就看 `docker compose logs migrate api` |
| 檢查顯示「資料庫連不上」 | Docker 沒開 | 開 Docker Desktop，再 `docker compose up -d` |
| 檢查顯示「Ollama 連不上」 | Ollama 沒開 | 打開 Ollama；Jev 沒把握時會改用 Jev 的第一名，不會壞掉，只是看不到 LLM 代選 |
| 排行程回「沒有接得上的組合」 | 條件太嚴，或選了沒場次的日期 | 放寬時間、預算、步行距離；錯誤訊息會列出被哪個條件排除最多 |
| 排行程回「這一天沒有符合條件的場次」 | 日期沒場次，或場次已經開演完 | 換有場次的日期，或把出門時間提早 |
| 等很久都在「等待交通查詢額度」 | TDX 每分鐘 5 次，多人同時排就要排隊 | 正常現象；Demo 時一次排一個 |
| 回「你已經有一個規劃在進行」 | 同一台電腦上一個規劃還沒結束 | 等它結束；或關掉前端分頁（斷線會自動取消） |
| 場次是舊的 | 排程沒跑到（電腦睡眠、Docker 沒開） | `uv run python -m app.jobs.refresh atmovies`（約 5 分鐘） |
| TDX 回錯誤（交通查詢暫時無法使用） | TDX 本身出問題或點數用完 | 檢查「TDX 本月點數」；暫時改 `.env` 的 `TDX_MODE=mock` 再 `docker compose up -d` 用模擬路線 |

## 6. 手動更新資料

```bash
uv run python -m app.jobs.refresh atmovies
```

| 指令 | 內容 | 時間 |
|---|---|---|
| `refresh atmovies` | 開眼的影城、電影、場次 | 約 5 分鐘 |
| `refresh osm` | OpenStreetMap 餐廳＋店家屬性判斷 | 抓資料約 1 分鐘；判斷每次最多 25 分鐘，沒做完的下次補 |
| `refresh stations` | TDX 軌道車站 | 約 2 分鐘 |
| `refresh hubs` | 商圈代表點的座標 | 約 1 分鐘 |

在本機執行 `osm`（要判斷店家屬性）時，Ollama 的網址要用 localhost：

```bash
OLLAMA_BASE_URL=http://localhost:11434 uv run python -m app.jobs.refresh osm
```

## 7. 前後端合約檢查

前端改過 `schemas.ts`、或後端改過回應格式時，跑一次就知道前端會不會擋下後端的資料：

```bash
uv run python tools/contract-check/collect.py
```

```bash
node tools/contract-check/check.ts tools/contract-check/out
```

每一種回應印出 OK 或 FAIL（附上哪個欄位不相容）。用的是 `frontend/` 裡的前端程式，要先把前端更新到最新版。

## 8. 結束

```bash
docker compose down
```

資料庫的內容會留著，下次 `docker compose up -d` 就回來了。不要加 `-v`，加了會把資料庫清掉。
