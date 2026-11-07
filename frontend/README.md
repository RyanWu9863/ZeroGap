# ZeroGap 零空檔｜前端

> 娛樂、餐廳、交通，一次排到剛剛好。資策會 AIAE1 第一組專題的網頁前端。

## 跑起來

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 單元測試（Vitest）
npm run e2e        # 流程測試＋無障礙檢查（Playwright＋axe：桌機 Chromium、桌機 WebKit、iPhone 13、iPad；第一次要先 npx playwright install chromium webkit）
npm run build      # 正式打包到 dist/
npm run build:pages  # GitHub Pages 版（預設網址多一層 /zerogap-frontend/，可用環境變數 PAGES_BASE 改）
npm run og         # 重新產生連結預覽圖 public/og.png
npm run icons      # 重新產生 iOS 主畫面圖示 public/apple-touch-icon.png
npm run predemo    # Demo 前一鍵檢查：型別＋單元測試＋流程測試＋打包
npm run perf       # 手機慢速 4G 載入時間量測（LCP 目標 2 秒內）
```

## Mac 和 Windows 都能開發

所有指令在 Mac（終端機）和 Windows（PowerShell 或 VS Code 的終端機）上都一樣。

| 項目 | 說明 |
|---|---|
| Node.js | 版本 24（寫在 `.nvmrc`，最低 22.12）。到 nodejs.org 下載 LTS 安裝即可；用 nvm 的人執行 `nvm use` |
| 換行字元 | `.gitattributes` 規定 repo 裡一律用 LF，Windows 的 Git 不會再把整個檔案改成 CRLF |
| 編輯器 | `.editorconfig` 統一縮排 2 格、UTF-8、LF；VS Code 會提示安裝 EditorConfig 擴充套件 |
| 流程測試瀏覽器 | 第一次執行 `npx playwright install chromium webkit`，Mac 和 Windows 都支援 |
| 腳本 | `package.json` 的指令都不用 Mac 專屬語法；需要檔案操作的寫成 `scripts/*.mjs`（用 Node 跑） |
| 自動檢查 | 推上 GitHub 後，`.github/workflows/ci.yml` 會在 Windows 和 Linux 各跑一次型別、lint、測試、打包；Mac 用本機的 `npm run predemo` |

設定環境變數的寫法不一樣（只有 `build:pages` 換 repo 名稱時才需要）：

```bash
PAGES_BASE=/my-repo/ npm run build:pages
```

```powershell
$env:PAGES_BASE="/my-repo/"; npm run build:pages
```

複製設定檔：Mac 用 `cp .env.example .env`，Windows 用 `copy .env.example .env`。

## 假資料與後端

預設使用假資料（`VITE_USE_MOCK=true`）。要接後端時複製 `.env.example` 成 `.env`，把 `VITE_USE_MOCK` 改成 `false`。開發時 `/api` 會自動轉給 `localhost:8000`。新版的 Google 地圖模式需要 `VITE_GOOGLE_MAPS_KEY`（沒設就只有路線示意圖），設定方式見導讀 07。

API 合約照**後端規格書 v0.13 第 6 章**（`docs/backend-spec.md`，舊的 `docs/API.md` 已停用）。`POST /api/plans` 回傳 SSE 串流，一次規劃約 2～3 分鐘。改接的經過見 `docs/導讀_06_改接後端v0.9.md`。

## 目前進度

| 頁面 | 網址 | 狀態 |
|---|---|---|
| 介紹頁 | `/` | 試做稿完成（兩版） |
| 四步精靈 | `/plan/1~4` | 完成（三版） |
| 結果頁 | `/result` | 等待畫面（SSE 進度）、有解、無解一鍵放寬、換一部／換一家、其他班次、改條件小視窗、條件寫進網址（三版） |
| 系統幕後 | `/behind` | 方法、漏斗（長條／桑基）、Jev 機率、資料來源、展示模式、Agent 接口、原始 JSON |

**外觀**：右上角可以切換夜／日，預設跟著手機或電腦的設定。字體、外框、夜日運作方式見 `docs/導讀_08_地基.md`。

預覽特殊情境（只在假資料模式有效）：

- 無解：網址加 `?mock=no_solution`，預算設在 $800 以下
- 系統拿不定：網址加 `?mock=low_confidence`，電影選「幫我挑」：第 1 案的電影、用餐那一步底下可以換一部／換一家，第 2 案的回程有其他班次
- 沒有場次：`?mock=no_showtimes`
- 排隊已滿：`?mock=queue_full`
- 從目前位置出發：精靈第 1 步按「使用目前位置」（定位要 HTTPS，`localhost` 例外）；假後端在離桃園站超過 30 公里時回 400

## 特殊模式（網址參數）

| 參數 | 用途 |
|---|---|
| `?exp=1`／`?exp=0` | 沉浸式新版：篩選漏斗、電影式三方案、路線地圖、幕後三種視覺化（見 `docs/導讀_07_沉浸式新版.md`）；預設關閉 |
| `?mock=no_solution`、`low_confidence`、`no_showtimes`、`queue_full` | 預覽無解、系統拿不定、沒有場次、排隊已滿（只在假資料模式） |
| `?mock=pending` | 預覽等待畫面：規劃一直不回應（只在假資料模式） |
| `?mock=options_error` | 預覽精靈的「載入失敗＋重試」：商圈清單前 2 次失敗，按重試就恢復（只在假資料模式） |

## Docker（決策 Q10）

```bash
docker build -t zerogap-frontend .                                    # 接真的後端
docker build -t zerogap-frontend:mock --build-arg VITE_USE_MOCK=true .  # 展示版（假資料）
```

nginx 提供打包好的網頁，`/api/` 轉給 `BACKEND_URL`（預設 `http://backend:8000`，小組 docker-compose 裡後端服務叫 `backend` 就不用改）。後端還沒啟動時前端照樣能開，只有 `/api` 回 502。

## 部署

- `.github/workflows/ci.yml`：每次推上 GitHub，在 Windows 和 Linux 各跑型別、lint、測試、打包（Mac 由開發者本機的 `npm run predemo` 驗證）。
- `.github/workflows/pages.yml`：GitHub Pages 展示版（固定假資料）。**目前只能手動執行**，因為小組還沒決定要公開發布；改成自動發布的方法寫在檔案開頭。私人 repo 要用 Pages 需要付費方案，或改成公開 repo。

## 文件

- **`docs/接手指南.md`：新加入的組員從這裡開始**

- `docs/前端決策紀錄.md`：問答定下來的所有決定（Q103～Q108 是改接後端時的決定）
- `docs/API變更提案_前端需求.md`：當初要請後端加的欄位（後端的處理見規格書 6.7）
- `docs/導讀_01～07`：每一版程式的白話說明（05 是 iPhone 適配，06 是改接後端規格書，07 是 `?exp=1` 沉浸式新版）
- `docs/試用計畫_第13天.md`、`docs/彩排腳本_第14天.md`：試用與上台用
- `docs/前端後續優化計畫.md`：下一階段的盤點與 Roadmap（P0～P3）
- `docs/效能量測_P2-4.md`：手機 4G 載入時間量測與優化

## 技術

React 19、Vite、TypeScript、Tailwind CSS v4、shadcn/ui（Base UI）、React Router、Zustand、TanStack Query、zod、Motion、Recharts、Lucide；測試用 Vitest＋Playwright。
