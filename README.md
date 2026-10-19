# ZeroGap 零空檔｜前端

> 娛樂、餐廳、交通，一次排到剛剛好。資策會 AIAE1 第一組專題的網頁前端。

## 跑起來

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 單元測試（Vitest，37 個）
npm run e2e        # 流程測試（Playwright，Chromium＋WebKit，12 個；第一次要先 npx playwright install chromium webkit）
npm run build      # 正式打包到 dist/
npm run build:pages  # GitHub Pages 版（PAGES_BASE=/repo名稱/）
npm run og         # 重新產生連結預覽圖 public/og.png
npm run predemo    # Demo 前一鍵檢查：型別＋單元測試＋流程測試＋打包
```

預設使用假資料（`VITE_USE_MOCK=true`）。要接後端時複製 `.env.example` 成 `.env`，把 `VITE_USE_MOCK` 改成 `false`。開發時 `/api` 會自動轉給 `localhost:8000`。

## 目前進度

| 頁面 | 網址 | 狀態 |
|---|---|---|
| 介紹頁 | `/` | 試做稿完成（兩版） |
| 四步精靈 | `/plan/1~4` | 完成（三版） |
| 結果頁 | `/result` | 五道關卡動畫、有解、無解、低信心挑選頁、改條件小視窗、條件寫進網址（三版） |
| 系統幕後 | `/behind` | 方法、漏斗（長條／桑基）、Jev 機率、資料來源、展示模式、Agent 接口、原始 JSON |

畫面左下角可以切換三版試做稿：**A 時刻表**（淺色）／**B 電影感**（深色）／**C Linear 風**（深色極簡）。也可以直接傳網址 `?proto=timetable`、`?proto=cinematic`、`?proto=linear`。

預覽特殊情境（只在假資料模式有效）：

- 無解：網址加 `?mock=no_solution`，預算設在 $800 以下
- 系統拿不定：網址加 `?mock=low_confidence`，電影選「幫我挑」

## 特殊模式（網址參數）

| 參數 | 用途 |
|---|---|
| `?proto=timetable｜cinematic｜linear` | 切換試做版 |
| `?trial=1`／`?trial=0` | 試用模式：自動計時＋3 題問卷，紀錄在系統幕後匯出 |
| `?present=1`／`?present=0` | 簡報模式：字放大，按 1–3 套用情境卡、B 系統幕後、H 首頁 |
| `?mock=no_solution`、`?mock=low_confidence` | 預覽無解、系統拿不定（只在假資料模式） |

## Docker（決策 Q10）

```bash
docker build -t zerogap-frontend .                                    # 接真的後端
docker build -t zerogap-frontend:mock --build-arg VITE_USE_MOCK=true .  # 展示版（假資料）
```

nginx 提供打包好的網頁，`/api/` 轉給 `BACKEND_URL`（預設 `http://backend:8000`，小組 docker-compose 裡後端服務叫 `backend` 就不用改）。後端還沒啟動時前端照樣能開，只有 `/api` 回 502。

## 部署

推到 GitHub 的 `main` 後，`.github/workflows/pages.yml` 會自動打包並發布到 GitHub Pages（固定假資料）。需要在 repo 的 Settings → Pages 把 Source 設成「GitHub Actions」。

## 文件

- `docs/前端決策紀錄.md`：102 題問答定下來的所有決定
- `docs/API變更提案_前端需求.md`：要請後端加的欄位
- `docs/導讀_01～04`：每一版程式的白話說明
- `docs/試用計畫_第13天.md`、`docs/彩排腳本_第14天.md`：試用與上台用

## 技術

React 19、Vite、TypeScript、Tailwind CSS v4、shadcn/ui（Base UI）、React Router、Zustand、TanStack Query、zod、Motion、Recharts、Lucide；測試用 Vitest＋Playwright。
