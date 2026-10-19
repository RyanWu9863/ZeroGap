# ZeroGap 零空檔｜前端

> 娛樂、餐廳、交通，一次排到剛剛好。資策會 AIAE1 第一組專題的網頁前端。

## 跑起來

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 單元測試（Vitest）
npm run build      # 正式打包到 dist/
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

## 文件

- `docs/前端決策紀錄.md`：102 題問答定下來的所有決定
- `docs/API變更提案_前端需求.md`：要請後端加的欄位
- `docs/導讀_01～03`：每一版程式的白話說明

## 技術

React 19、Vite、TypeScript、Tailwind CSS v4、shadcn/ui（Base UI）、React Router、Zustand、TanStack Query、zod、Motion、Recharts、Lucide。
