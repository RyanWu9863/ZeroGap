# ZeroGap 零空檔後端：討論紀錄（交接用）

> 最後更新：2026-10-20
> 進度：使用者要趕進度，**選擇用預設值直接產出規格書**，規格書是 [backend-spec.md](backend-spec.md)（目前 v0.7，Markdown。v0.7 是一致性檢查後的修正版；v0.6 料理加日式韓式、八德兩個代表點；v0.5 補上票價、料理類別、片型做法、商圈代表點；v0.4 依初步簡報調整輸入輸出、Jev 角色、交通查詢策略、出發站；v0.2 把 MCP 改回手寫工具；v0.3 依 MCP 2026-07-28 版規範改成無狀態、LLM 備援統一用 Ollama，並加上排隊上限、固定 RQ 版本）。第 5 節的待解決事項、第 6 節的第 5 步項目，都已用預設值寫進規格書第 10 節，標記為【預設】；之後只需要調整預設值，或補上【待提供】的資料。
> 原始架構圖：[architecture-original.webp](架構圖/architecture-original.webp)。**圖上有些地方已經過時，一律以本文件為準**，變更清單見第 2 節。
> 新架構圖（對應規格書 v0.4）：[architecture-v0.4.svg](架構圖/architecture-v0.4.svg)，已放進規格書 2.1 節。簡報和 Word 用的 PNG 是 [architecture-v0.4.png](架構圖/architecture-v0.4.png)（2680×2640）。舊版的圖還留著，但已過時，用 headless Chrome 以 2 倍解析度從 SVG 轉出；SVG 修改後要重新轉。

---

## 0. 給接手的 Claude：工作方式

- **一步一步討論**，每輪大約問 4～6 題。有取捨時用表格列出選項和各自的影響，**讓使用者決定**。
- **不懂就問，不要替使用者做決定。** 只有使用者明確說「幫我決定」時才代為決定（例如 Jev 的上限數字），而且要說明理由。
- 用繁體中文。
- 牽涉外部服務（TDX、Google、Jev、套件現況）時，**先查官方文件再說**，不要憑印象。查不到就明說查不到。
- 使用者已經決定的事不要重問。除非出現新資訊會改變結論，例如之前因為 TDX 額度，重新提出過已被否決的 C2。

### 討論順序

1. 理解架構圖 ✅
2. PostgreSQL 資料設計 ✅
3. Redis ✅
4. FastAPI ⏳（只剩第 5 節「待解決」的第 1 項）
5. 部署、測試、錯誤處理
6. 整理成正式規格文件

---

## 1. 專案背景

- **用途**：專題報告，要展示給廠商看。
- **功能**：使用者選擇條件，系統規劃「電影＋餐廳＋交通」的約會行程。
- **三大亮點**：FastAPI、PostgreSQL、Redis。
- **部署**：用 Docker，會測試多個程式實例。
- **現況**：從零開始，還沒有程式碼。

---

## 2. 架構（修正後）

```
網頁 frontend ──▶ REST API /api ─┐
外部 MCP 客戶端 ─▶ MCP /mcp ──────┤   （同一個 FastAPI 程式；MCP 工具由 REST 端點自動轉換）
                                 ▼
                           services.py（API 與 MCP 共用）
                                 │  規劃請求：放進 RQ「規劃」佇列
                                 ▼
               RQ worker 執行 planner.py
               1. 排出 5 個候選
               2. transit.py：走路距離內用 PostGIS 估算，否則查 TDX 旅運規劃 API（Redis 快取）
               3. 向 Google Place Details 補店名、地址、營業時間、價位（不存）
               4. app/jev/：Jev 判斷時間、交通、預算
                  └ 信心值 < 0.6 → llm.py 備援
               5. 依答案排序，回傳 3～5 個方案
                                 │  進度和結果經 Redis Pub/Sub → SSE 推給前端

寫入路：rq cron（每天 06:00、每 30 天）→ RQ「抓取」佇列 → worker
        collectors（開眼電影網場次、Google Places 餐廳、OSM 餐廳、TDX 地理編碼）
        → ingest.py（UPSERT 寫入、Jev 預判）→ PostgreSQL（含 PostGIS）
```

### 跟原圖相比的變更

| 原圖 | 現在 |
|---|---|
| `/api/chat` | **刪除**，沒有自然語言輸入 |
| `llm.py` 負責解析需求、寫摘要 | **只負責 Jev 判斷不了時的備援** |
| `llm.py` 只接 REST API | 寫入時、規劃時都可能用到，一律呼叫自家 Ollama。MCP 也一樣，不用 sampling |
| fixture 提供交通資料 | **TDX 旅運規劃 API 即時查詢**，要包含公車 |
| `transit.py` 自己算轉乘、末班車、車資 | 呼叫 TDX，並用 Redis 快取結果 |
| 資料庫有「車站、路段」表 | **刪除** |
| OSM 提供餐廳 | **Google Places 為主**，OSM 備案 |
| PostgreSQL／SQLite | **只用 PostgreSQL** |
| `refresher.py` 在程式內排程 | **rq cron 觸發，交給 RQ worker 執行**；worker 啟動時補抓 |
| 沒有 Redis | 新增 Redis（見第 4.4 節） |

---

## 3. 外部服務（已查證的事實）

### 3.1 Jev（TypeSafe AI 的決策模型）

- 屬於「System One」決策模型，2026/9/15 發表，最新版本 jev-1.14。**不是聊天模型，不產生文字。**
- 題型有三種：
  - `choice`：從選項挑一個，回傳選項、每個選項的機率、信心值
  - `score`：照等級打分，回傳分數、每個等級的機率、信心值
  - `noul`：某條件成立的機率，0～1，**沒有信心值**
- 呼叫方式：`POST https://api.typesafe.ai/v1/systemone`，body 包含 `model`（例如 `jev-latest`）、`state`、`questions`（`{題目id: {type, instructions, criteria}}`）。Python SDK 是 `typesafe-sdk`。
- 一次可以問多題，題目平行處理。
- 計費只算輸入 token，約每百萬 token 0.042 美元。
- **換 Jev 版本，答案可能不同。**
- 信心值的官方建議：高就直接採用、中就請人確認、低就不採用或轉給其他系統。門檻要用自己的資料調整。
- 使用者帳號的上限：每分鐘 1,200 次請求、每秒 25 萬 token。5 美元約可做 30 萬次判斷。
- 文件：https://docs.typesafe.ai/introduction/quickstart 、https://docs.typesafe.ai/confidence

### 3.2 TDX（運輸資料流通服務）

- 認證用 OAuth2 client credentials。token 1 天後過期；換 token 的端點每個 IP 每分鐘最多 20 次。
- **旅運規劃 API**：`GET https://tdx.transportdata.tw/api/maas/routing`
  - `origin`、`destination`：格式為 `lat,lng`
  - `gc`：0～1，1 偏好最快、0 偏好最便宜
  - `top`：回傳幾條路線，最多 10
  - `transit`：交通工具代碼，3 高鐵、4 台鐵、5 公車、6 捷運、7 輕軌…
  - `depart` 或 `arrival`：**不能是過去的時間**
  - `first_mile_mode`、`last_mile_mode`：頭尾的移動方式，0 是走路；時間預設 10 分鐘，最多 60 分鐘
  - `transfer_time`：轉乘時間範圍
  - 查不到路線時會自動放寬時間，**要檢查回傳的時間是否符合要求**
  - 使用者實測過，**有回傳車資**
  - 訪客模式不能用，要金鑰
- **額度**（使用者確認）：
  - **每分鐘 5 次，所有 TDX API 共用**
  - 每月免費 3 點：
    - 基礎服務：1 點可呼叫 1,500 次
    - 進階服務（含地理編碼）：1 點只能呼叫 200 次
    - **MaaS 服務（旅運規劃）不扣點**
  - 點數用完後有 5% 緩衝，緩衝也用完，當月就停權
- 地理編碼服務確定存在（屬進階服務），但**端點細節還沒查到**，要到 TDX 後台的 Swagger 確認。

### 3.3 Google Places API (New)

- **條款**：只有 `place_id` 可以永久保存；座標最多存 30 天；店名、地址、營業時間等其他內容，**不可預先抓取、快取或儲存，存進 Redis 也算**。顯示資料時要附 Google 標誌。
- **計費**：一次呼叫以 field mask 裡最高的等級計費（官方欄位表）：
  - Essentials：`location`、`formattedAddress`、`types`
  - Pro：`displayName`、`primaryType`、`businessStatus`
  - Enterprise：`regularOpeningHours`、`rating`、`priceLevel`
- **每月免費額度**（各 SKU 分開算）：Essentials 1 萬次、Pro 5 千次、Enterprise 1 千次。
- 本專案的用途：
  - Nearby Search：寫入時找餐廳，Pro 等級
  - Place Details Enterprise：規劃時補店家資料
  - Place Details Essentials：每 30 天更新座標

### 3.4 其他

- **RQ**：2.5 版起內建週期排程（`rq cron`，不同版本的參數名稱不同）。worker 預設用 `fork()`，不支援 Windows，所以**開發時 worker 跑在 Docker 裡**。
- **arq**：官方公告只做維護，已排除。
- **MCP sampling**：在 2026-07-28 版規範中**列為棄用**，見 5.1。

---

## 4. 已確定的決定

### 4.1 使用者輸入與規劃規則

| 項目 | 決定 |
|---|---|
| 區域 | 八德、桃園、中壢、青埔，四選一；只在同一區域內規劃 |
| 出發地、終點 | 下拉選單，兩者用**同一份地標清單**（每區幾個地標，團隊提供地址，用 TDX 地理編碼轉座標）|
| 順序 | 先看電影或先吃飯，由使用者選 |
| 餐廳類別 | 單選，可以不選 |
| 電影種類 | 單選，可以不選 |
| 出發時間 | 現在之後，到場次資料的最後一天（約一週）|
| 人數 | 只用來算總花費：票價和車資乘以人數 |
| 預算 | **總額**；是否符合預算交給 Jev 判斷 |
| 電影票價 | 每家影城手動設定一個（`cinemas` 表的欄位）|
| 候選數 | `planner.py` 排出 **5 個**候選給 TDX 和 Jev |
| 回傳 | 3～5 個方案 |
| 身分驗證 | **不需要**，只靠 IP 限流 |
| 規劃紀錄 | **不存** |

### 4.2 Jev 的用法

- **寫入時**（答案不因人而異）：電影種類、餐廳類別、影城和餐廳屬於哪個區域。
- **規劃時**：排程排完後，判斷每個候選的時間、交通、預算。
- **排序依「答案」**，例如「時間充裕」的機率，**不是依信心值**。
- 信心值 **< 0.6** 就算判斷不了，交給 LLM：
  - `/api` 和寫入時：用自家 Ollama（qwen2.5:3b）
  - MCP 客戶端：同樣用 Ollama。原本選 sampling，因為 2026-07-28 版規範把它列為棄用，2026-10-20 改掉
- 寫入時的判斷什麼時候重算：**每 30 天**（跟 Google 座標更新一起），以及**換 Jev 版本時全部重算**。
- 自家設的上限（使用者請我決定）：
  - **每分鐘 300 次請求**（官方上限的 1/4，防止程式出錯一直重試）
  - **不限制每秒 token**
  - **每月費用上限 1 美元**：用回應裡的 token 數乘單價累加，以百萬分之一美元為單位存成整數

### 4.3 PostgreSQL

- 只用 PostgreSQL。
- 採用的功能：
  - **PostGIS**：座標用 `geography` 型別
  - **JSONB**
  - **UPSERT**（`INSERT … ON CONFLICT`）
- 不採用的功能：`tstzrange`、物化視圖、分割資料表。
- 存取工具：**SQLAlchemy 2.0 ＋ GeoAlchemy2 ＋ Alembic**。
- 驅動程式：**psycopg 3**，API（非同步）和 worker（同步）共用。

#### 資料表（使用者已確認）

| 資料表 | 主要欄位 | 唯一鍵 | 索引 |
|---|---|---|---|
| `areas` | 代碼、名稱（4 筆固定資料，用 migration 寫入）| 代碼 | — |
| `locations` 地標 | 所屬區域、名稱、地址、座標、地理編碼時間 | 區域＋名稱 | 區域 |
| `cinemas` | 開眼 ID、名稱、地址、座標、所屬區域（Jev）、**票價（手動）**、地理編碼時間 | 開眼 ID | 座標（GiST）、區域 |
| `movies` | 開眼 ID、片名、片長、分級、種類（Jev）| 開眼 ID | — |
| `showtimes` | 影城、電影、開演時間、散場時間（開演＋片長）、版本 | 影城＋電影＋開演時間＋版本 | 影城＋開演時間 |
| `restaurants` | 來源（google／osm）、外部 ID、座標、座標取得時間、所屬區域（Jev）、類別（Jev）、是否有效。**Google 來源不存店名和地址**；OSM 來源可以存店名、營業時間 | 來源＋外部 ID | 座標（GiST）、區域＋類別 |
| `categories` | 種類（電影種類／餐廳類別）、代碼、顯示名稱、給 Jev 的選項說明 | 種類＋代碼 | — |
| `jev_judgments` | 對象類型＋對象 ID、題目、答案、各選項機率（JSONB）、信心值、判斷者（jev／llm）、Jev 版本、判斷時間 | 對象＋題目 | Jev 版本、判斷時間 |
| `crawl_runs` | 工作名稱、開始和結束時間、狀態、統計（JSONB）、錯誤訊息 | — | 工作名稱＋開始時間 |

#### 已確認的設計假設

1. Jev 的判斷結果存兩份：主表的欄位用來篩選，`jev_judgments` 存完整細節。
2. `jev_judgments` 只保留最新一次，重算時覆蓋。
3. 時間一律用 `timestamptz`。
4. 座標用 `geography`，距離單位是公尺。
5. 主鍵用自動遞增整數。
6. 類別清單存在 `categories` 表，不寫死在程式裡。
7. 過期的場次在每天抓取時刪掉。
8. OSM 備案：OSM 餐廳另外存一份，Jev 一樣判斷類別和區域。Google Enterprise 額度用完時，`planner.py` 只從 OSM 餐廳裡挑。

### 4.4 Redis

- 用途：
  - **A1** TDX token 共用
  - **A2** TDX 路線快取
  - **B1** 排程鎖（用 Redis 鎖，不用 PostgreSQL advisory lock）
  - **B2** 限流
  - **C1** 任務佇列（RQ）
  - **C2** 非同步規劃＋進度推播（因為 TDX 額度，從原本不採用改為採用）
- 不採用：請求時的 Jev 快取、整份規劃結果快取、對話紀錄。
- **Google 的店家資料一律不放進 Redis。**
- 設定：**只開一個 Redis**；記憶體滿了就拒絕寫入（`noeviction`）；持久化用 **RDB 快照，每 60 秒一次**。
- 任務佇列用 **RQ**，分兩條佇列：「規劃」優先、「抓取」其次。

#### 排程與鎖

```
rq cron（只負責觸發）── 每天 06:00 ──▶ 抓取佇列 ──▶ worker 取出工作
                                          │
                            搶鎖 lock:job:{工作名稱}
                            ├─ 搶到：執行，做完後釋放
                            └─ 沒搶到：直接跳過
```

- 鎖的值是隨機字串，比對後才釋放。10 分鐘過期，工作還在跑就延長。
- worker 啟動時查 `crawl_runs`，今天還沒成功抓過就把工作放進佇列。
- 每 30 天的重算（Jev 判斷、Google 座標）走同一套流程。

#### Key 一覽

| 用途 | Key | 型別 | 過期時間 |
|---|---|---|---|
| TDX token | `tdx:access_token` | 字串 | TDX 給的有效期限減 5 分鐘 |
| 換 token 的鎖 | `lock:tdx:token` | 字串 | 30 秒 |
| 路線快取 | `tdx:route:v1:{起點ID}:{終點ID}:{出發時段}:{交通工具}` | 字串（JSON）| **6 小時** |
| 排程鎖 | `lock:job:{工作名稱}` | 字串 | 10 分鐘，可延長 |
| 滑動窗口限流 | `rl:tdx`、`rl:jev`、`rl:api:plan:{IP}`、`rl:api:read:{IP}` | 有序集合 | 跟窗口一樣長 |
| 每個 IP 同時一個規劃 | `active:plan:{IP}` | 字串 | 規劃的逾時上限 |
| 每月額度 | `quota:{對象}:{年月}`，例如 `quota:tdx_points:2026-10`、`quota:google:details_enterprise:2026-10` | 計數器 | 下個月初再多留幾天 |
| 佇列 | RQ 自己管理（`rq:*`）| — | — |
| 規劃進度 | 頻道 `plan:{job_id}:events`（提案）＋目前狀態 | Pub/Sub ＋ 字串或 hash | 規劃結束後 |

- 路線快取的出發時間**往後**取整到 **15 分鐘**，例如 18:07 算成 18:10，查「18:10 出發」，使用者不會錯過車。
- 起點和終點用資料庫 ID，不用座標。
- 開頭的 `v1` 是版本號，改了 TDX 查詢參數就換成 `v2`。

#### 限流（B2）

- **計數方式**：每分鐘、每小時的上限用**滑動窗口**；每月上限照**日曆月**計數，跟帳單一致。

| 對象 | 上限 | 超過時 |
|---|---|---|
| TDX（所有 API 共用）| 每分鐘 5 次 | **排隊等候**，前端顯示「前面還有 N 個」|
| TDX 點數 | 每月 9,000 單位（1 點 = 3,000 單位；基礎呼叫 2 單位、進階呼叫 15 單位、MaaS 0 單位）；不動用 5% 緩衝 | 停止呼叫（主要影響地理編碼）|
| Google Place Details Enterprise | 每月 **950** 次（留 5% 邊際，因為 RDB 可能少記最後一分鐘）| **改用 OSM 備案** |
| Google 其他 SKU | Pro 5 千、Essentials 1 萬（要不要也留邊際還沒討論）| — |
| Jev | 每分鐘 300 次、每月 1 美元 | 規劃時回「太忙」（這是早期的決定；改成非同步後只重新討論過 TDX 的部分）|
| 自家：建立規劃（`/api/plans`、MCP `plan_date`）| 每個 IP 同時 1 個、每小時 10 次 | HTTP 429 加 `Retry-After` |
| 自家：其他查詢 | 每個 IP 每分鐘 60 次 | HTTP 429 加 `Retry-After` |

### 4.5 FastAPI 與非同步規劃

- API 用**非同步**（`async def`）。RQ worker 是同步的。
- **`POST /api/plans` 直接回傳 SSE 串流**（一步驟設計）：
  1. 先訂閱 Redis Pub/Sub
  2. 再把工作放進 RQ「規劃」佇列
  3. 推送進度：排隊位置、查詢路線中等等
  4. 最後**推送完整結果，Redis 不存結果**
- 前端用 `fetch` 讀串流，因為 `EventSource` 只支援 GET。
- **使用者斷線就取消工作**：排隊中的直接移除，執行中的讓 RQ 停下來。錯過結果時，使用者要重新送出。
- `/api/chat` 刪除。

### 4.6 MCP

- 工具（5 個）：
  - `plan_date`：規劃行程
  - `list_areas`：列出區域
  - `list_locations`：列出某區的地標
  - `list_categories`：列出電影種類和餐廳類別
  - `data_coverage`：查哪些日期有場次資料
- 掛載方式：原本選丙（自動轉換 REST 端點），但自動轉換做不到 sampling，**2026-10-20 使用者決定改回手寫工具**：
  - 用官方 MCP Python SDK 手寫工具，直接呼叫 `services.py`
  - 刪除只為自動轉換而加的 `/api/plans/sync`
- `plan_date` 執行期間送出 MCP 進度通知。
- **2026-10-20 再次修改（v0.3）**：MCP 2026-07-28 版規範把 sampling 列為棄用（見 5.1），使用者同意以下改法：
  - MCP 改成無狀態
  - LLM 備援直接用 Ollama
  - 拿掉 `ip_hash` 和 Redis 的 sampling 轉送
  - 進度通知保留
  - 詳見規格書 6.6。

---

## 5. 待解決／待確認

1. ~~MCP 選丙的後續問題~~：已解決，2026-10-20 改回手寫工具，見 4.6。
2. `noul` 題型沒有信心值，「判斷不了」的規則還沒定。
3. 「走路距離內不查 TDX」的參數還沒定：距離門檻（例如 800 公尺）、繞路係數、步行速度。
4. `planner.py` 怎麼產生 5 個候選（排程演算法），以及規劃時問 Jev 的題目怎麼設計，都還沒細談。
5. 規劃工作的逾時時間。
6. Google Pro、Essentials 要不要也留 5% 邊際。
7. Jev 在規劃時碰到上限要回「太忙」還是排隊等候（改成非同步後沒有重新確認）。
8. **使用者要提供的資料**：電影種類和餐廳類別的清單、每個區域的地標清單（名稱和地址）、每家影城的票價。
9. TDX 地理編碼的端點細節（到 TDX 後台確認）。

---

## 5.1 2026-10-20 查證結果

- **MCP 規範 2026-07-28 版**（官方 changelog）：
  - 移除 session 和 `Mcp-Session-Id`，協定改為無狀態，也拿掉 initialize 握手。
  - **Sampling、Roots、Logging 列為棄用**：新的實作不應採用，官方建議改成「直接呼叫 LLM 供應商的 API」取代 sampling。
  - 由伺服器主動發出的請求（sampling、elicitation）改用 MRTR：伺服器回傳 `InputRequiredResult`，客戶端帶著 `inputResponses` 重送原本的請求。
  - 進度通知仍然可以用，走該請求的回應串流。
  - SSE 的斷線續傳被移除，串流斷掉時客戶端要重新送出請求。
  - 結論：規格書 v0.2 的「有狀態 session ＋ ip_hash ＋ Redis 轉送 sampling」是建立在棄用功能上。**使用者已同意改成 MCP 也直接用 Ollama、MCP 改無狀態**，已寫入規格書 v0.3。
- **TDX 地理編碼**：
  - 正確的 API 是進階服務的「空間查詢-定位 v3」：`/api/advanced/V3/Map/GeoCode/Coordinate/Address/{Address}`，另有地標名稱版 `.../Markname/{Markname}`。
  - 名為「輔助工具-地理編碼轉換」的 API 只能轉換 OpenLR 代碼。
  - 已寫入規格書 3.4。
- **RQ cron**：
  - 寫法是 `cron.register(func, queue_name=..., cron='0 6 * * *')`，`cron=` 參數是 2.5 版新增的，cron 功能本身從 2.4 版開始，目前標為測試版。
  - cron 依執行環境的時區計算，所以容器要設 `TZ=Asia/Taipei`。
  - 已寫入規格書 5.6、8.1。

### 2026-10-20 其他決定（v0.3）

- 排隊上限：`plans` 佇列最多 5 個在等，滿了回 503 `QUEUE_FULL`；在佇列裡超過 15 分鐘就作廢。
- RQ 固定 2.12.x（2026-08-30 發布的最新版）。
- cron 容器設定 `TZ=Asia/Taipei`。

## 5.2 2026-10-20 對照「初步簡報.pdf」（規格書 v0.3 待調整）

簡報第 4 頁的實際畫面有 16 個條件：約會縣市、商圈、從哪個縣市出發、出發站、日期、最早出門、最晚到家、吃飯順序、想看的片（可選「交給 Jev 決定」）、想看的片型、影廳、語言、想吃、飲食限制、每人預算（含來回車資）、影城到餐廳步行。

**輸出**：前三名方案，標籤有 Jev 首選、最省、最穩。卡片上有出門時間、到家時間、每人花費、最緊緩衝，每人花費分成票、餐、去程車資、回程車資，估計值會另外標示。頁首狀態列顯示 Jev 模式、LLM 連線狀態、各資料的更新時間。

**Jev 的角色（簡報第 7、9 頁）**：
- 程式先篩出時間、轉乘、末班車、營業時間、預算都接得上的組合。
- Jev 只負責「選」：看哪部片、吃哪家、去回程搭什麼。
- 時間和金額全部由程式計算。
- 寫入時讓 Jev 判斷：適不適合約會、吃一餐要多久（快速／一般／慢食）、料理類別。
- 最高機率低於 60% 時，列出前幾名讓使用者自己改選。

**跟規格書的衝突**：
- 規格書目前是「程式先挑 5 個 → Jev 判斷時間、交通、預算 → 信心值低於 0.6 交給 LLM」，預算也交給 Jev 判斷。
- 規格書 1.3 寫「不做跨區域規劃」，Q4 也決定出發地只能在區域內；但簡報允許從其他縣市出發，而且回到出發站就是「到家」。

**使用者的決定（2026-10-20，已寫入規格書 v0.4）**：
1. Jev 的角色**照簡報**：
   - 程式篩掉時間、末班車、營業時間、預算接不上的所有組合。
   - Jev 只負責選片、選餐廳、選去回程路線。
   - 排名用「選片機率 × 選餐廳機率」。
   - 預算不再交給 Jev 判斷。
2. 沒把握時用**丙**：LLM（Ollama）先從前 3 名選一個，其他候選列為 `alternatives`，讓使用者改選。
   - 判斷標準：使用者沒有明確回答要用「最高機率」還是「信心值」。我照簡報用**最高機率低於 0.6**，已在回覆中說明，使用者可以再改。
3. 交通**照建議**：
   - 先查 2～4 次 TDX 求出可行時間：去程查到影城或代表點，回程用 `arrival` 查從代表點或影城回出發站。
   - 影城和餐廳之間用步行估算。
   - 篩完所有組合後，前三名再用 `top=3` 查精確路線，由 Jev 選車。
4. 出發站改用 **TDX 軌道車站資料**（台鐵、高鐵、捷運、輕軌），依縣市分組。
   - `locations` 表改成 `stations`，地標清單不再需要團隊提供。
   - 新增 `counties` 表；`areas` 新增「代表點」欄位，資料由團隊提供。
5. 餐費用**乙**：寫入時由 Jev 判斷每家店的價位區間，再換算成金額。預設的區間和金額見規格書 7.3。
6. 飲食限制分三類：素食、不吃牛、對什麼過敏。
   - 預設的過敏原清單：甲殼類海鮮、花生堅果、蛋、奶、麩質。
   - 寫入時由 Jev 判斷每家店的屬性；不確定時一律排除，結果附上「請向店家確認」的提示。

**v0.4 新增的預設值**：候位 10 分鐘、用餐時間（快速 45／一般 75／慢食 105 分鐘）、最後點餐為打烊前 30 分鐘、步行上限選項、價位換算金額、最晚到家可以到隔天凌晨 02:00、營業時間驗證失敗最多補 2 輪。全部列在規格書第 10.1 節。

**注意**：本文件第 4.1 節的「輸入」和第 4.2 節的「Jev 用法」已被 v0.4 取代，一律以規格書 v0.4 為準。

### 2026-10-20 補充資料（規格書 v0.5）

- **片型**：使用者問能不能從最近上映的電影抓。
  - 查證結果：開眼電影網的上映清單和電影頁都**沒有片型欄位**，只有片長、語言、出品國等。
  - 規格書的做法：由 Jev 從片型主清單判斷（主清單是預設值），下拉選單只顯示目前有場次的片型。這個做法待使用者確認。
- **料理類別**：使用者提供西式、中式、美式。簡報畫面上有「日式」，要不要加，已問使用者。
- **影城票價**：使用者提供五大品牌（威秀、秀泰、國賓、新光、in89）一般廳和特殊廳的價格區間。
  - 規格書改成 `ticket_prices` 表（品牌 × 影廳）。
  - `cinemas` 加上 `chain` 和 `ticket_price_override`；估計票價取區間的中間值。
- **八德代表點**：使用者回答「大楠跟廣豐新天地」。我推測「大楠」是「大湳」，已向使用者確認，也問了要用一個還是兩個代表點。
- 其他 3 個商圈的代表點，先用預設值（桃園站、中壢站、高鐵桃園站），待確認。

### 2026-10-20 決定（規格書 v0.6）

- 料理類別加入**日式、韓式**，目前共有西式、中式、美式、日式、韓式，加上其他。
- 八德的代表點**兩個都用**：大湳、廣豐新天地。
  - 「大楠」照「大湳」處理，使用者沒有異議。
  - 規格書新增 `area_hubs` 表，一個商圈可以有多個代表點，每家店自動對應最近的一個，用 PostGIS 的 `<->` 查詢。
  - 回程可行性查詢會多 1 次，每次規劃的 TDX 呼叫上限變成約 11 次。
- 其他 3 個商圈的代表點（桃園站、中壢站、高鐵桃園站）和片型主清單，使用者沒有提出修改，先照預設值。

### 2026-10-20 一致性檢查與分享（規格書 v0.7）

- 請子代理逐行檢查 v0.6，找到 20 處前後不一致，全部修正成 v0.7。主要修正：
  - 座標更新統一為「超過 25 天就更新」，條款上限是 30 天。
  - TDX 呼叫次數統一為「通常約 11 次以內」，規劃時間統一為「約 2～3 分鐘」，並補上換下一組時的最差次數。
  - `active:plan:{IP}` 的過期時間改成 25 分鐘，涵蓋排隊 15 分鐘加執行 10 分鐘。
  - `jev_judgments` 新增 `jev_version` 欄位，避免由 LLM 代答的資料每天被重算。
  - `restaurants.geom` 改成可以是 null。
  - 拿掉 `ticket_price_override` 和沒用到的 `plan:{job_id}:status`。
  - 影廳、片型改用統一的代碼，API 另外附上 `*_label`。
  - `movies` 新增 `country` 欄位。
  - `crawl_runs.job` 的名稱和狀態列的 key 對齊。
  - Ollama 逾時的處理分成規劃時和寫入時兩種。
  - 6.5 範例改成符合規則的數字：用餐 20:07 開始、餐費 150、票價 350、最緊緩衝 10 分鐘，並示範 LLM 代選和 `alternatives` 的格式。
  - 10.1 補上 12 個原本漏列的預設值。
  - 新增風險：電影和餐廳各有最多 10 個選項時，Jev 的最高機率常常會低於 0.6，所以 LLM 代選會很常出現。
- 規格書最前面加上「0. 給組員的審閱重點」。
- **給組員看的網頁**（私人分享，由使用者決定要分享給誰）：https://claude.ai/artifact/LzNC6Q716vraixUuoDsFKY
  - 網頁是從 `docs/backend-spec.md` 用 `tools/spec-page/build_spec_page.py` 和 `spec_template.html` 產生的。
  - 規格書改版後要重新產生網頁，再發布到同一個網址（Artifact publish 時帶 `url`）。

### 2026-10-20 對照前端 ZeroGap（規格書 v0.8）

使用者給了 `C:\Users\User\Downloads\ZeroGap.zip`，裡面是組員做的前端（`ZeroGap/frontend`，React＋Vite，做到 fe-v0.5，目前全部用假資料）。

**發現**：
- 前端是照另一份 `docs/API.md` 和 `AI_CONTEXT.md` 寫的，這兩份我們沒看過，可能在組員的 `~/Desktop/JEV` 小組 repo 裡。
  - 端點是 `POST /api/itineraries`（一次回傳 JSON）、`GET /api/options`（一次給全部下拉選單）、`GET /api/status`。
  - 請求送中文名稱，例如 `"桃園區"`、`"中壢站"`、`"看完電影再吃"`、`"不限"`、`"交給 Jev 決定"`。
  - 回應裡有 `refs.outbound_trip_id`，又提到「Demo 前重新匯入 TDX 快照」，看起來那份合約背後是匯入時刻表快照的設計，跟我們即時查 TDX 旅運規劃不同。
- 前端寫了一份 `docs/API變更提案_前端需求.md`，提出 10 項要後端加的欄位。
- 前端的時程：第 9～10 天（約 10/27～28）串真後端，約 11/2 Demo。前端定位成「全方位行程規劃」，文案不寫「約會」。
- 前端沒有顯示 Google 標誌；飲食限制只有「沒有／素食」單選；時間滑桿最晚 23:45。

**使用者的決定**：
1. **以我們的規格書為準**，請前端改 `client.ts` 和 `schemas.ts`。
2. **維持 SSE**。前端改用 `fetch` 讀串流。
   - 查證 nginx 官方文件：`proxy_buffering` 預設開啟，可以用回應標頭 `X-Accel-Buffering: no` 關掉；`proxy_read_timeout` 預設 60 秒，算的是兩次讀取之間的時間，不是整個回應。
   - 所以後端的 SSE 回應帶 `X-Accel-Buffering: no`；前端 nginx 的 30 秒在 15 秒心跳下可以用。上一輪我說「30 秒也會逾時」不正確，已更正。
3. **Jev 沒把握時維持 LLM 代選＋`alternatives`**。前端把「插一頁讓使用者挑、再重送」改成在結果頁「換一部／換一家」。
4. **飲食限制先不做**。我理解成整個功能延後：請求的 `diet`、`allergies`，`restaurants` 的三個欄位，寫入時的 Jev 題目，`diet_notice` 都拿掉。原本的設計移到規格書附錄 A。
5. **前端提案只收「必要」的 #1、#2、#3、#4、#6**：
   - #1：時間軸每一步加 `buffer_minutes`、`buffer_gate`，關卡有 `showtime`、`last_order`、`return_trip`、`latest_return`，定義沿用 v0.7 的最緊緩衝。
   - #2：每一步加 `place`（`station`、`hub`、`cinema`、`restaurant`）。
     - 查證 Google Places 條款：Places 的資料畫在地圖上時必須用 Google 地圖；沒有搭配 Google 地圖時要附 Google 標誌；`place_id` 可以無限期保存。
     - 所以 Google 來源的餐廳只回 `place_id`、不回座標。前端用 Maps URLs 的 `destination_place_id` 開 Google 地圖，不需要金鑰（已查證）。
     - 建議前端的 SVG 路線示意圖不要依座標擺放 Google 來源的餐廳。
   - #3：見第 6 點。
   - #4：`/api/coverage` 加 `available_dates`；請求的 `date` 必須是其中一天。
   - #6：不加 `restaurant_name`，用 `decided_by` 和 `alternatives` 的 key 表示哪一項沒把握。
   - #5 不需要（資料每天自動更新）；#7～#10 這一版不做。
6. **方案標籤照前端**：每張一個 `highlight`，三張不重複，key 用 `cheapest`、`safest`、`earliest_return`、`shortest_walk`，取代 v0.7 的 `labels`。
   - 分配規則使用者沒有指定，先寫入【預設】：依名次 1→3，各取「在三個方案中最好、還沒被用掉」的一項，順序是最省→最穩→最早回到站→走最少路；都沒有時為 `null`。

**其他寫入 v0.8 的內容**：
- 新增 6.7「前端串接」：端點對照、代碼和 id、SSE、代理設定、Google 顯示規則、前端提案的處理。
- 8.1 新增 `web` 容器（前端），`/api/` 轉給 `proxy`【預設】。
- 8.4 測試項目改成時間軸緩衝、特色標籤分配、Google 餐廳不帶座標。
- 架構圖（`architecture-v0.4.svg`，檔名不變）改了文字：前端改名「網頁 ZeroGap」、拿掉「含飲食限制」、TDX 可行時間改成 2～5 次（v0.6 起就是 5 次，圖上漏改）、圖例改成對應 v0.8。PNG 已重新轉出。

**還沒解決**：
- `alternatives` 每個備選附「算好的到家時間」，但步驟 6 只替前三名查精確路線，備選的回程要多查 TDX，7.1 的呼叫次數沒算進去（v0.7 就有的缺口）。另外前端在結果頁換一部或換一家之後，時間軸要不要整條換掉，也還沒決定。
- 前端顯示 OSM 來源的資料時，可能也要標示 OSM 的出處，還沒查證。

### 2026-10-20 決定（規格書 v0.9）

1. **備選只附估計值**：電影、餐廳的 `alternatives` 只附到家時間和每人花費，用步驟 2 的回程路線估算，不多查 TDX，標 `estimated: true`。前端換一部或換一家時只更新摘要，時間軸不換。這也補上 v0.7 的缺口：v0.7 寫「附算好的到家時間」，但沒算進額外的 TDX 呼叫。
   - 電影備選要搭配餐廳：同一家接得上就用同一家，不然用該電影分數最高的可行餐廳【預設】。
2. **特色標籤**：第一名固定 `recommended`（最推薦）。第二、三名照原本的預設規則分配，可能是 `null`。
3. **回程緩衝兩個都給**：`return_trip` 那一步加 `return_window`，內容是預定那班車的時間和分鐘數、最晚要離開的時間和分鐘數。
   - 我的解讀：`buffer_minutes` 和最緊緩衝仍然照「最晚要離開」計算（v0.7 的定義），「最穩」也跟著它。已寫進規格書，使用者可以再改。
4. **沒有另一個後端**：`docs/API.md` 是前端自己寫的合約。
5. **直接改前端程式**：另開一個 session「前端 ZeroGap 改接後端規格 v0.9」處理。
   - 程式解壓到 `D:\test_backend\frontend\`，在前端自己的 git 開 `feature/backend-v0.9` 分支。
   - 用 `git format-patch` 產生補丁到 `D:\test_backend\frontend-patches\`，讓使用者轉交給前端組員。
6. **後端直接開始完整實作**，預設值之後邊做邊改。前端預計 10/27～28 串真後端。

### 2026-10-20 改名與實作前的決定

- **專案改名 ZeroGap 零空檔**，跟前端一樣；圖示和網站名稱照前端（ZG 字母加錶盤刻度）。不再用「約會一條龍」。
  - 已改：規格書標題、討論紀錄標題、CLAUDE.md、組員網頁（標題、ZG 標誌、favicon、標語「娛樂、餐廳、交通，一次排到剛剛好」）。
  - Artifact 的圖示只能選一個通用字，選了 `clock`（最接近錶盤）。
  - 規格書內文的「約會商圈」、Jev 題目「適不適合約會」、MCP 工具 `plan_date` 等字眼還沒改，已問使用者。
- **實作順序**：先做從頭跑到尾的最小版本。API、SSE、規劃流程照規格；資料用標「示意」的種子資料；Jev、TDX、Google 先用模擬版。之後再換成真的服務和爬蟲。
- **金鑰**：TDX、Google、TypeSafe 都還沒有，全部先用模擬版，金鑰到了改 `.env` 切換。
- **Docker**：使用者會打開或修好 Docker Desktop（目前引擎連不上，預設路徑也找不到 Docker Desktop）。
- **Git**：在 `D:\test_backend` 建 git，`frontend/` 不納入。使用者問資料夾要怎麼改名比較好，已回覆做法。
- **Ollama**：開發時用本機的 Ollama（0.40.4，GTX 1050 Ti 4GB），Demo 時用 compose 裡的容器。
- 環境：Python 3.13、uv 0.12、git、Node 24、gh 都有。
- 實作計畫：`docs/plans/2026-10-20-backend-phase1.md`。
- 使用者寫完計畫後說「先暫停」，後端程式還沒開始寫，git 也還沒建。

### 2026-10-20 前端對照時發現的缺口（規格書 v0.10）

前端 session 轉來使用者的要求：「把這 6 個缺口轉給後端 session，請它補進規格書。」完整內容在前端留的備忘 `前端預期的API格式.md`。前端已交接到另一台電腦繼續，交接文件在 `frontend-patches/`。

照前端的預期寫進規格書；屬於選擇的標【預設】：
1. 6.3 補上 `/api/counties`、`/api/areas`、`/api/stations`、`/api/categories` 的範例，四個都直接回陣列。
2. `latest_home` 早於 06:00 算隔天，最晚到隔天 02:00；`earliest_departure` 一律是當天【預設】。
3. `reasons` 的 key 定為 `showtime`、`walk`、`opening_hours`、`last_order`、`last_train`、`budget`，依這個順序檢查，第一個不符合的計入【預設】。前端另外認得 `return_trip`、`latest_home`，後端不會送。
4. `queued.position`：1 代表下一個就輪到。
5. 備選餐廳的 `name` 可能是 `null`（Google Pro 額度用完時）。
6. 電影備選加 `restaurant_id`、`restaurant_name`、`restaurant_cuisine`，搭配的餐廳跟方案不同時才有值。`restaurant_cuisine` 是我加的，讓店名是 `null` 時還能顯示類別。

另外：
- **OSM 出處**：查證 OSMF 署名指南。要寫「OpenStreetMap」並連到 `https://www.openstreetmap.org/copyright`，讓人看得出是 ODbL；不用點開就要看得到；一組結果標一次即可。已寫進 6.7 和第 3 節。
- **`web` 的 `BACKEND_URL=http://proxy`**：8.1 已經有寫。
- **出發站只開放桃園市**：前端備忘寫這是使用者在前端 session 的決定。規格書 6.7 記成前端的做法，後端仍接受任何縣市；要不要連後端也限制，待問使用者。
- 實作計畫 B2 的排除原因改用上面的 key。

### 2026-10-20 開始實作（規格書 v0.11）

- 使用者說「從 A1 開始」，照實作計畫依序寫後端。資料夾已改名為 `D:\ZeroGap`，計畫的路徑和依據版本已同步更新。
- 規格書 v0.11 只修兩處，都是實作計畫裡記下要回頭改的：
  - `restaurants.source` 新增 `demo`，給示意種子資料用；CHECK 約束一樣只限制 `google`。
  - 5.3 路線快取的範例改成「18:07 算成 18:15」，原本的 18:10 跟 15 分鐘的取整單位不符。
- 7.3 補上價位區間的代碼【預設】：`under_200`、`200_500`、`500_1000`、`over_1000`。原本只有範例裡出現 `under_200`。
- Docker 引擎已經連得上（29.8.0）。
- 實作進度：A（骨架）、B（規劃的純邏輯，79 個單元測試）完成。
  - compose 的 PostgreSQL 對外用 5433，因為本機的 5432 已經有別的 PostgreSQL；proxy 對外開 8000，對上前端 Vite 的轉發。
  - C（模擬版 TDX、模擬版 Jev、Ollama 代選）完成，102 個單元測試。使用者對 B 新增的預設值說「先照預設」。
  - Ollama 實測（本機 0.40.4，`qwen3:1.7b`）：結構化輸出（`format` 帶 JSON schema）可以用；第一次呼叫要載入模型，花了 61 秒，熱機後 4.6 秒，關掉思考（`think: false`）2.5 秒。所以請求一律帶 `keep_alive: 30m`，並新增 `OLLAMA_THINK` 設定（預設不送）。
  - 本機的 Ollama 原本沒有規格書指定的 `qwen2.5:3b`，使用者選擇下載（選項 A），已下載完成。實測代選：第一次 5.5 秒（含載入），之後每次 2.4 秒，都選中符合「日式」的那家。
  - E（限流、鎖、每月額度、路線快取）完成，共 143 個測試。限流的時間由程式傳進 Lua script，測試不用真的等；路線快取包成 `CachedTransit`，沒命中才呼叫 TDX，TDX 的限流也只在這時候等。
  - 測試時發現：Redis 連不上時，redis-py 預設會重試，每次讀寫可能卡好幾秒。之後建立 Redis 連線要設定連線和讀寫的逾時。
  - D（資料表、migration、示意種子資料、PostGIS 查詢）完成，11 個整合測試。整合測試每次重建 `zerogap_test` 資料庫。compose 新增只跑一次的 `migrate` 服務。
  - Docker 容器用 `host.docker.internal` 連得到本機的 Ollama。
  - 實作 B 時遇到規格書沒寫清楚的地方，先照最直接的做法寫，全部標【預設】加進規格書 10.1（標「實作時新增」）：Jev 還沒判斷的屬性、營業時間的格式和判斷、`stats.feasible` 的基準、排名同分、兩題都由 LLM 代選、餐廳備選只列接得上的、`minutes_to_planned` 的算法、特色標籤的文字。**這些要找時間跟使用者確認。**

## 6. 剩下的步驟

- **第 5 步：部署、測試、錯誤處理**
  - Docker Compose 的組成：API（多個）、RQ worker（多個）、`rq cron`（一個）、Redis、PostgreSQL＋PostGIS、Ollama
  - 金鑰（TDX、Google、Jev）怎麼存放
  - 反向代理，以及怎麼拿到使用者的真實 IP（例如 `X-Forwarded-For`）
  - 多實例時的負載平衡：SSE 長連線（MCP 已改無狀態，不需要固定連線）
  - Ollama 跑在哪裡、用 CPU 還是 GPU
  - 外部 API 的逾時和重試
  - 測試：模擬 TDX、Google、Jev（原圖的 `app/jev/` 有「模擬版」），測試用的 PostgreSQL 和 Redis
  - 額度用量的監控
  - 規劃 worker 要開幾個（TDX 每分鐘只有 5 次，開多個也不會更快）
- **第 6 步：整理成正式規格文件**，格式和放置位置要問使用者。

---

## 7. 參考來源

- TypeSafe Jev：https://docs.typesafe.ai/introduction/quickstart 、https://docs.typesafe.ai/confidence 、https://openrouter.ai/docs/guides/community/jev
- TDX 旅運規劃 Swagger：https://tdx.transportdata.tw/api-service/swagger/maas/4513f9d6-caae-4cf7-a50c-e7887bec804e
- TDX OpenAPI 規格檔：https://tdx.transportdata.tw/webapi/File/Swagger/V3/4513f9d6-caae-4cf7-a50c-e7887bec804e
- TDX 官方範例（token 限制）：https://github.com/tdxmotc/SampleCode
- Google Places 條款：https://developers.google.com/maps/documentation/places/web-service/policies
- Google Maps URLs：https://developers.google.com/maps/documentation/urls/get-started
- nginx proxy 模組（`proxy_buffering`、`X-Accel-Buffering`、`proxy_read_timeout`）：https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- Google Places 欄位等級：https://developers.google.com/maps/documentation/places/web-service/data-fields
- Google Maps Platform 價格：https://mapsplatform.google.com/intl/zh-TW_tw/pricing
- RQ 內建 cron：https://python-rq.org/docs/cron/
- RQ 與 Windows：https://python-rq.org/docs/testing
- arq 只做維護：https://pypi.org/project/arq
