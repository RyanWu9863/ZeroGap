# API 變更提案：前端需要的欄位

> 提案人：前端｜日期：2026-10-19｜對象：後端組員
> 依據：`docs/API.md`（目前合約）與 `docs/前端決策紀錄.md`（前端 102 題決策）
> 依 AI_CONTEXT §7.1 規則 6，接受後請同步更新 `docs/API.md`、`backend/app/schemas/` 與 `AI_CONTEXT.md` §6。

---

## 0. 一句話

前端的核心畫面是**一條每段都打勾的大時間軸**（「零空檔：保證接得上」）。要畫出這條時間軸，前端需要後端多給幾個**結構化欄位**。所有時間和金額仍然**只由 Python 計算**，前端只負責顯示，不自己算。

## 1. 總表

| # | 變更 | 端點 | 等級 | 前端用在哪 |
|---|---|---|---|---|
| 1 | 每一步加 `buffer_minutes`、`buffer_gate` | POST `/api/itineraries` | **必要** | 時間軸每兩步之間的「✓ 開演前還有 10 分」 |
| 2 | 每一步加 `place`（名稱，最好再加座標） | POST `/api/itineraries` | **必要** | 地點可點開 Google 地圖、SVG 路線示意 |
| 3 | 每張方案加 `highlight`（特色標籤） | POST `/api/itineraries` | **必要** | 三張方案卡的「最省／最穩／最早回到站」 |
| 4 | `options` 加 `available_dates` | GET `/api/options` | **必要** | 日曆只開放有場次資料的日子 |
| 5 | Demo 前重新匯入資料快照 | 資料匯入 | **必要** | 基準案例 10/15 已過，API 又規定日期不得早於今天 |
| 6 | 閥門沒過時說明哪一項不確定 | POST `/api/itineraries` | 必要（若實作閥門） | 「這幾部都接得上，你比較想看哪一部？」挑選頁 |
| 7 | `funnel_stats` 加每道關卡剔除數 | POST `/api/itineraries` | 加分 | 篩選動畫、系統幕後的漏斗圖 |
| 8 | `districts` 加影城名稱、餐廳數 | GET `/api/options` | 加分 | 商圈卡片「2 間影城・約 40 家餐廳」 |
| 9 | 每一步加 `cost_item` | POST `/api/itineraries` | 加分 | 花費貼在發生的那一步旁邊 |
| 10 | 回傳幾組被淘汰的代表候選＋原因 | POST `/api/itineraries` | v2 | 「一張張翻開、劃掉」的淘汰動畫 |

順帶確認：AI_CONTEXT 待決 **Q2（範例缺回程步行）**。前端假資料已先補上「步行回桃園站」這一步，請後端修正後讓真實回應也有這一步。

---

## 2. 逐項說明

### #1 每一步的緩衝（必要）

**為什麼**：「保證接得上」要讓使用者看得到，最直接的方式是在每兩步之間標出「還有多少餘裕」。目前只有 `min_buffer_minutes`（最緊一段）和 `early_return_buffer_minutes`（回到站的餘裕），前端不知道其他段的緩衝。前端也不能自己用時間相減：關卡時刻（例如最後點餐 21:00）只寫在 `desc` 文字裡，而且那樣會違反「時間只由 Python 計算」的鐵律。

**加在** `timeline_steps[]`：

| 欄位 | 型態 | 說明 |
|---|---|---|
| `buffer_minutes` | integer \| null | 這一步「到下一個關卡」的餘裕分鐘；沒有關卡的步驟為 `null` |
| `buffer_gate` | string \| null | 對應的關卡：`showtime`（開演）／`last_order`（最後點餐）／`return_trip`（回程班次）／`latest_return`（最晚回到站） |

```json
{ "time": "17:40", "type": "步行", "desc": "走 5 分鐘到桃園統領威秀，取票",
  "buffer_minutes": 10, "buffer_gate": "showtime" }
```

前端依分鐘數顯示三級：≥30 寬鬆、10–29 剛好、<10 偏緊（門檻在前端設定檔，只影響顏色，不影響可行與否）。

### #2 每一步的地點（必要）

**為什麼**：時間軸上的地點要能點開 Google 地圖，結果頁右側要畫 SVG 路線示意。目前地點名稱只夾在 `desc` 文字裡，前端拆字串很容易壞。

**加在** `timeline_steps[]`：

```json
"place": { "name": "桃園統領威秀", "kind": "theater", "lat": 24.9897, "lng": 121.3127 }
```

| 欄位 | 必要？ | 說明 |
|---|---|---|
| `place.name` | 必要 | 給 Google 地圖搜尋用 |
| `place.kind` | 必要 | `station`／`theater`／`restaurant` |
| `place.lat`、`place.lng` | 加分 | 有座標時 Google 地圖連結更準、路線圖比例更像 |

交通步驟的 `place` 填上車站。前端用網址 `google.com/maps/dir/?api=1&…&travelmode=transit` 開啟，不需要 API 金鑰。

### #3 方案特色標籤（必要）

**為什麼**：前端決定使用者畫面不出現「Jev／AI／機率」（竹老師建議），所以 `rank_label` 的「Jev首選」不會直接顯示。另外第三張只有「Jev第三選擇」，缺一個讓人想選它的理由。對應 AI_CONTEXT 待決 **Q3**（「最省」「最穩」的判定公式）。

**加在** proposal：

```json
"highlight": { "key": "cheapest", "label": "最省", "reason": "每人 $550，三個方案中最便宜" }
```

`key` 建議值：`cheapest`（最省）／`safest`（最穩，最緊緩衝最大）／`earliest_return`（最早回到站）／`shortest_walk`（走最少路）。三張卡的 `key` 不重複。`rank_label` 可以保留給系統幕後頁使用。

### #4 有資料的日期（必要）

**為什麼**：資料是手動匯入的快照，只有某幾天有場次。前端日曆會把沒資料的日子灰掉，避免使用者選了才發現無解。

**加在** `GET /api/options` 回應：

```json
"available_dates": ["2026-10-30", "2026-10-31", "2026-11-01"]
```

已經是今天以前的日子不要列。

### #5 Demo 前重新匯入資料（必要）

API 規定 `date` 不得早於今天，但基準案例是 **2026-10-15（已過）**。前端預計 **11/2 左右 Demo**，請在 Demo 前把開眼、TDX 快照匯入到 Demo 當週，並把基準案例改成那一週的日期。前端的三張情境卡（下班晚場 17–23／週末午後先吃再看 12–18／小資 $500）也要用新資料確認排得出來。

### #6 閥門沒過時，哪一項不確定（若實作閥門則必要）

**為什麼**：閥門（0.60）沒過時，前端會在結果前插一頁「這幾部都接得上，你比較想看哪一部？」。前端需要知道要問「電影」還是「餐廳」。

**加在** `confidence_gate`：

```json
"confidence_gate": {
  "threshold": 0.60, "passed": false,
  "uncertain_field": "movie",
  "choices": [ { "id": 12, "label": "劇場版 魔法少女小圓" }, { "id": 15, "label": "不存在的罪人" } ]
}
```

使用者挑完後，前端把選中的片名填進 `movie_title`（或餐廳）重送一次，所以不需要新端點。閥門要用在哪一步（AI_CONTEXT **Q1**）定案後，再一起調整這個欄位。

### #7 每道關卡剔除幾組（加分）

**為什麼**：篩選動畫要讓五道關卡依序打勾、數字往下跳；系統幕後頁要畫漏斗圖，是向評審證明「保證接得上」的關鍵證據。

**加在** `funnel_stats`：

```json
"by_filter": [
  { "id": 1, "name": "時空連貫", "eliminated": 820 },
  { "id": 2, "name": "餐飲營業", "eliminated": 610 },
  { "id": 3, "name": "步行距離", "eliminated": 260 },
  { "id": 4, "name": "末班車",   "eliminated": 101 },
  { "id": 5, "name": "預算",     "eliminated": 50 }
]
```

依濾網執行順序；`total_checked - sum(eliminated) = feasible_count`。

### #8 商圈卡片資料（加分）

**加在** `options.districts[]`：

```json
{ "id": 1, "city": "桃園市", "name": "桃園區", "theater_names": ["桃園統領威秀", "新光影城"], "restaurant_count": 42 }
```

### #9 每一步對應哪筆花費（加分）

**加在** `timeline_steps[]`：`"cost_item": "movie_ticket"`（值同 `cost_breakdown` 的 key；沒有花費的步驟為 `null`）。沒有這個欄位的話，前端會依 `type` 對應（交通 → 車資、電影 → 票價、晚餐 → 餐費），但去程／回程要靠順序猜。

### #10 淘汰樣本（v2）

回傳 10～20 組被淘汰的代表候選和淘汰原因，給竹老師說的「像對發票一樣一張張劃掉」動畫使用。MVP 先不做。

---

## 3. 完整範例：一個 proposal 加上 #1 #2 #3 #9

```json
{
  "rank": 1,
  "rank_label": "Jev首選・最省",
  "highlight": { "key": "cheapest", "label": "最省", "reason": "每人 $550，三個方案中最便宜" },
  "timeline_steps": [
    { "time": "17:15", "type": "交通", "desc": "中壢站搭台鐵到桃園站",
      "place": { "name": "中壢車站", "kind": "station" }, "cost_item": "transit_outbound",
      "buffer_minutes": null, "buffer_gate": null },
    { "time": "17:40", "type": "步行", "desc": "走 5 分鐘到桃園統領威秀，取票",
      "place": { "name": "桃園統領威秀", "kind": "theater" }, "cost_item": null,
      "buffer_minutes": 10, "buffer_gate": "showtime" },
    { "time": "17:55", "type": "電影", "desc": "《劇場版 魔法少女小圓》片長 119 分鐘",
      "place": { "name": "桃園統領威秀", "kind": "theater" }, "cost_item": "movie_ticket",
      "buffer_minutes": null, "buffer_gate": null }
  ]
}
```

其餘欄位不變。

## 4. 前端這邊先怎麼做

- 前端的 TypeScript 型別和 zod 檢查**已經把以上欄位設為選填**，後端還沒加之前，畫面會退回較簡單的顯示，不會壞。
- 假資料（`src/mocks/`）已先帶這些欄位，方便後端對照格式。
- 後端完成後，前端改用 `/openapi.json` 自動產生型別。
