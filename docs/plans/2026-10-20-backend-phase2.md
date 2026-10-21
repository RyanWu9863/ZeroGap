# 後端第二階段實作計畫：接上真的資料

> 依據：`docs/backend-spec.md` v0.12，以及討論紀錄「第二階段開始前的查證」「第二階段：第 1 輪決定」。日期：2026-10-20。
> 金鑰：TDX 已有；Google、TypeSafe 還沒有（Google 最後才接）。
> 執行方式：跟第一階段一樣，純邏輯先寫測試，每個任務做完就 commit。

## 任務

### H. TDX
- [x] **H1 token**：`POST .../auth/realms/TDXConnect/protocol/openid-connect/token`，存在 Redis `tdx:access_token`（有效期限減 5 分鐘），換 token 用 `lock:tdx:token`（5.3）。
- [x] **H2 旅運規劃**：`GET /api/maas/routing`，照實測格式寫好解析和用戶端（`app/tdx.py`），車資沒給時自己估。`TDX_MODE=real` 已可用，2026-10-20 用真的 TDX 排出一次行程（62 秒）。
- [x] **H3 車站匯入**（2026-10-20 實際匯入 545 站，桃園市 24 站）：v2 的台鐵、高鐵、捷運（含機捷 TYMC）車站，UPSERT 到 `stations`，取代示意的出發站。
- [~] **H4 地理編碼**：代表點完成（車站用 TDX 車站座標；大湳待確認）。影城地址等開眼爬蟲做好再轉。

### I. OSM 餐廳
- [ ] **I1 Overpass 匯入**：每個商圈的代表點周圍抓 `amenity=restaurant|fast_food|cafe`，UPSERT（`source='osm'`），帶 User-Agent，429 時等 30 秒。
- [ ] **I2 屬性判斷**：有 OSM 標籤的照標籤對應，其他交給 Ollama（寫入時的 Jev 題目，7.3）；結果寫進 `jev_judgments`。
- [ ] **I3 商圈**：依距離歸到商圈（待確認）。

### J. 開眼電影網
- [x] **J1 影城清單**：a03 區，對應到商圈與品牌；光影館不收。
- [x] **J2 場次**：每家影城今天起有資料的每一天；版本文字對照到影廳、語言；跨午夜換到隔天。
- [x] **J3 電影**：片長、分級、語言、出品國、簡介（JSON-LD）；片型交給 Ollama 判斷。
- [ ] 每頁間隔幾秒，報告註明「僅供學術展示」。

### K. 排程
- [ ] **K1 `rq cron`**：開眼 06:00、18:00；OSM 每天；TDX 車站每週一；重新判斷每天 03:00。`cron` 容器 `TZ=Asia/Taipei`。
- [ ] **K2 工作鎖與 `crawl_runs`**：搶 `lock:job:{名稱}`；worker 啟動時今天還沒成功抓過就補抓。

### L. MCP
- [ ] **L1** 用 `mcp` 2.x 的 `MCPServer` 手寫 5 個工具，掛在 `/mcp`，進度通知照 6.6；設定 `TransportSecuritySettings`。

### M. 最後
- [ ] **M1 Google Places**、**M2 真的 Jev**：金鑰到了再做。
- [ ] 真資料取代示意資料；示意資料只留給測試。
- [x] 商圈：青埔先不開放；新增「蘆竹（南崁）」，代表點台茂購物中心（migration 0002）。
