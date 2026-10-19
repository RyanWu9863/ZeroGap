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
| 四步精靈 | `/plan/1~4` | 施工告示 |
| 結果頁 | `/result` | 試做稿完成（兩版，有解情境） |
| 系統幕後 | `/behind` | 施工告示 |

畫面左下角可以切換兩版試做稿：**A 時刻表**（淺色）／**B 電影感**（深色）。也可以直接傳網址 `?proto=timetable` 或 `?proto=cinematic`。

## 文件

- `docs/前端決策紀錄.md`：102 題問答定下來的所有決定
- `docs/API變更提案_前端需求.md`：要請後端加的欄位
- `docs/導讀_01_骨架與試做稿.md`：這一版程式的白話說明

## 技術

React 19、Vite、TypeScript、Tailwind CSS v4、shadcn/ui、React Router、Zustand、TanStack Query、zod、Motion、Lucide。
