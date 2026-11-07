# 前端重新設計 第 2 批「地基」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把優化版（無障礙、效能、錯誤處理、暫存版本、沉浸式零件、地圖、轉盤）整條合併進團隊 repo 的 `frontend/`，拿掉 A/B/C 三版、試用、簡報快捷鍵，換上「夜／日」兩套主題、新字體、新外框，並補上前端 CI。做完後畫面功能和現在一樣能用，但只剩一個版本，後面第 3～5 批在這個地基上重做頁面。

**Architecture:** 優化版的 `integrate/backend-v0.9-main` 分支（私人 repo，已經改接團隊後端的 Plan/SSE 格式）先追上私人 repo 的 `main`（PR #5～#9），再用 `git merge -X subtree=frontend` 合進團隊 repo（2026-11-07 試合過：零衝突、`tsc` 零錯誤、146 個單元測試通過）。合併後再分別 commit「刪除三版和工具」「夜／日主題」「字體」「外框」「CI＋偶發測試」。

**Tech Stack:** React 19、Vite 8、TypeScript 7、Tailwind v4、shadcn/ui（@base-ui/react）、Zustand、TanStack Query、zod 4、Motion、Vitest 5、Playwright 1.64、@axe-core/playwright 4.13.0。

**Spec:** `docs/superpowers/specs/2026-11-07-frontend-redesign-design.md`（第 4.1、8、9、10、11 節）

## Global Constraints

- 所有說明文字、commit 訊息、導讀用**繁體中文**、白話。
- 每個 commit 前 `cd frontend && npm run predemo` 必須全部通過（型別、單元測試、Playwright 三個瀏覽器、打包）。
- **只 add 自己改的檔案，不用 `git add -A`**（團隊規矩，`CLAUDE.md`）；合併 commit 例外（git 自己處理）。
- 新增套件只限這三個，版號固定、不加 `^`：`@fontsource-variable/archivo` `5.3.0`、`@fontsource/ibm-plex-mono` `5.3.0`（2026-11-07 使用者同意）；`@axe-core/playwright` `4.13.0`、`@vis.gl/react-google-maps` `1.10.1` 隨合併進來（使用者分別在 10/20、11/07 同意）。其他套件一律先問。
- 團隊 repo 是公開的，**`main` 有 `frontend/**` 改動就會自動發布 GitHub Pages**。這一批只推分支、開 PR，**不合併**；合併前問使用者。
- 不改 `backend/`。不碰 `~/Desktop/JEV/ZeroGap/team-main`（停在 `feat/mcp-v4`，等 PR #2）。
- 保留展示模式（`store/demoStore.ts`）：Demo 現場後端出問題時的保險；開關暫時留在系統幕後頁（第 5 批搬到新的幕後頁）。
- 保留 `?exp=1` 沉浸式開關到第 4 批（第 4 批用它的零件重做結果頁後再拿掉）。
- 使用者畫面不出現「AI」「Jev」「LLM」字眼（幕後頁除外）。

## 檔案地圖

| 路徑 | 這一批做什麼 |
|---|---|
| 私人 repo `~/Desktop/JEV/ZeroGap/frontend-integrate`（worktree，分支 `integrate/backend-v0.9-main`） | Task 1：合併私人 `main`，解 7 個衝突 |
| 團隊 repo `~/Desktop/JEV/ZeroGap/team-redesign`（worktree） | Task 2 起都在這裡；分支 `feat/frontend-foundation`，從 `docs/frontend-redesign-spec` 開（帶著規格和這份計畫） |
| `frontend/src/app/ProtoSwitcher.tsx`、`shared/theme/{proto.ts,LightTrails.tsx,LinearBackdrop.tsx}`、`features/{trial,present}/`、`src/fonts-serif.css` | Task 3：刪除 |
| `frontend/src/shared/theme/theme.ts`、`theme.test.ts`、`ThemeToggle.tsx` | Task 4：新增（主題偏好、套用、切換鈕） |
| `frontend/src/index.css` | Task 3 刪三版 token；Task 4 換成夜／日 token；Task 5 換字體 token |
| `frontend/index.html` | Task 4：開頁前先套主題，避免閃白 |
| `frontend/src/fonts.css`、`package.json` | Task 5：換字體 |
| `frontend/src/app/AppShell.tsx`、`app/SiteFooter.tsx`、`app/BottomNav.tsx` | Task 6：新外框 |
| `.github/workflows/frontend-ci.yml`（repo 根目錄） | Task 7：新增前端 CI；刪 `frontend/.github/` |
| `frontend/e2e/flows.e2e.ts` | Task 7：修偶發失敗的定位測試 |
| `frontend/e2e/foundation.e2e.ts` | Task 4、6：主題、外框的流程測試 |
| `frontend/docs/導讀_08_地基.md`、`frontend/README.md`、規格、這份計畫的進度表 | Task 8 |

---

### Task 1：integrate 分支追上優化版最新（私人 repo）

**Files:**
- Modify（解衝突）：`README.md`、`docs/前端後續優化計畫.md`、`docs/沉浸式體驗_進度交接.md`、`e2e/experience.e2e.ts`、`e2e/flows.e2e.ts`、`src/features/result/stage/PlanCardBody.tsx`、`src/features/result/stage/PlanStage.tsx`

**Interfaces:**
- Produces：分支 `integrate/backend-v0.9-main` 含私人 `main` 到 `4e79b2f`（PR #9）的全部改動，`npm run predemo` 通過。Task 2 從這個分支合併。

背景：integrate 分支 10/29 合的是私人 `main` 的 `5df4a4a`（PR #4）。之後私人 `main` 多了 PR #5～#9：轉盤（`da98987`、`e20727c`）、測試穩定（`d1ecfd8`、`2458ce3`、`de69e9f`、`9a9a8ac`、`90a49f5`、`ddf1065`、`5ee4732`、`dd90903`）和文件。integrate 這邊把 `stage/` 元件從舊的 Itinerary 格式改成團隊的 Plan 格式，所以兩邊改到同幾個檔案。

- [ ] **Step 1：確認工作區乾淨、開始合併**

```bash
cd ~/Desktop/JEV/ZeroGap/frontend-integrate
git status --short          # 只應該看到 ?? .vite.integrate.local.ts（暫時的 proxy 設定，不要 commit）
git log --oneline -1        # edb32d5
git merge main
```
Expected：`CONFLICT` 7 個檔案（上面列的）。

- [ ] **Step 2：三份文件取 integrate 這邊，再補一行**

```bash
git checkout --ours README.md docs/前端後續優化計畫.md docs/沉浸式體驗_進度交接.md
```
然後在 `docs/前端後續優化計畫.md` 進度表最後加一列：
```
| 追上私人 main（PR #5～#9） | ✅ 2026-11-07：轉盤、測試穩定併進改接後端的版本；之後在團隊 repo RyanWu9863/ZeroGap 的 frontend/ 繼續（見該 repo docs/superpowers/） |
```
`git add` 這三個檔案。

- [ ] **Step 3：兩個元件：以 main（轉盤）為底，重新套上 integrate 的格式改寫**

integrate 對這兩個檔案做的改寫 = `git diff 5df4a4a HEAD -- <檔案>`（`HEAD` 是合併前的 integrate）。做法：
```bash
for f in src/features/result/stage/PlanCardBody.tsx src/features/result/stage/PlanStage.tsx; do
  P="${TMPDIR:-/tmp}/zg-$(basename "$f").patch"
  git diff 5df4a4a ORIG_HEAD -- "$f" > "$P"   # ORIG_HEAD＝合併前的 integrate
  git checkout --theirs "$f"          # 先拿 main 的轉盤版本
  git apply --3way "$P" || echo "手動解：$f"
done
```
有剩下的 `<<<<<<<` 就手動解，規則：**畫面結構和轉盤邏輯（`useWheelSpin`、`WheelCard`、焦點跟隨）照 main；資料欄位（`plan.timeline`、`plan.cost_per_person`、`plan.highlight`、`min_buffer_minutes` 等 Plan 格式的名稱）照 integrate**。解完 `npx tsc -b` 必須零錯誤，然後 `git add` 兩個檔案。

- [ ] **Step 4：兩個測試檔：兩邊的改動都要**

`e2e/experience.e2e.ts`、`e2e/flows.e2e.ts`：打開衝突區塊，保留 integrate 的假資料情境和選取器（Plan 格式的文字、`?mock=` 情境名稱），再把 main 的穩定性改動加進去：`watchFor`／`expectSeen`（`e2e/seen.ts`）、等快捷鍵裝好再按、漏斗不等整頁 load、放寬的逾時。兩邊都有的測試保留一份。`git add` 兩個檔案。

- [ ] **Step 5：跑全套檢查**

```bash
npm ci
npm run predemo
```
Expected：最後一行 `✅ Demo 前檢查全部通過`。integrate 原本標成 `test.fixme` 的情境卡 ②③（假資料沒有跟情境卡走）維持 fixme，不算失敗。

- [ ] **Step 6：完成合併**

```bash
git commit --no-edit
git log --oneline -1
```
不 push（私人 repo 不需要；團隊 repo 從本機路徑抓）。

---

### Task 2：把 integrate 整條合併進團隊 `frontend/`

**Files:**
- 合併：`frontend/**`（約 115 個檔案）

**Interfaces:**
- Consumes：Task 1 的 `integrate/backend-v0.9-main`。
- Produces：分支 `feat/frontend-foundation` 上的合併 commit；之後 Task 3～8 都在這個分支。

- [ ] **Step 1：開分支、抓 integrate**

```bash
cd ~/Desktop/JEV/ZeroGap/team-redesign
git switch docs/frontend-redesign-spec
git fetch origin
git switch -c feat/frontend-foundation
git rebase origin/main            # 團隊 main 有新 commit 的話，把規格和計畫的 commit 接到最新上面
git fetch ~/Desktop/JEV/ZeroGap/frontend integrate/backend-v0.9-main:refs/remotes/private/integrate
```

- [ ] **Step 2：合併到 `frontend/` 子資料夾**

```bash
git merge --no-ff -X subtree=frontend private/integrate -m "merge: 優化版前端（無障礙、效能、錯誤處理、沉浸式零件）併進 frontend/

來源：Samuelsunshine/zerogap-frontend 的 integrate/backend-v0.9-main（已改接後端 Plan/SSE 格式，
並追上該 repo main 的 PR #5～#9）。共同祖先是 ec906eb（feature/backend-v0.9）。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git diff --stat HEAD~1 HEAD -- . ':!frontend' | tail -1   # 必須沒有任何 frontend/ 以外的改動
```
Expected：沒有衝突；第二行沒有輸出。如果有衝突，只會發生在團隊在 ec906eb 之後改過的兩個 commit（`c4dee8b` 精靈 hook 順序、`4f986c5` transit_window 說明），規則是**兩邊都要**：保留團隊的修正，也保留 integrate 的錯誤處理。

- [ ] **Step 3：裝套件、跑全套**

```bash
cd frontend
npm ci
npx playwright install chromium webkit
npm run predemo
```
Expected：`✅ Demo 前檢查全部通過`。若「目前位置離商圈太遠」那條失敗，那是已知的偶發問題（Task 7 修），重跑 `npx playwright test -g "目前位置離商圈太遠"` 通過即可繼續。

- [ ] **Step 4：確認 Pages 打包的網址前綴沒壞**

```bash
PAGES_BASE=/ZeroGap/ VITE_USE_MOCK=true npm run build:pages
grep -o 'src="/ZeroGap/assets/[^"]*"' dist/index.html | head -1
test -f dist/404.html && echo 404-ok
```
Expected：印出一個 `/ZeroGap/assets/...` 和 `404-ok`（`scripts/build-pages.mjs` 讀 `PAGES_BASE`，根目錄的 `.github/workflows/pages.yml` 會帶 `/ZeroGap/`）。

合併 commit 已經在 Step 2 完成，不用再 commit。

---

### Task 3：刪掉 A/B/C 三版、試用模式、簡報快捷鍵

**Files:**
- Delete：`frontend/src/app/ProtoSwitcher.tsx`、`frontend/src/shared/theme/proto.ts`、`frontend/src/shared/theme/LightTrails.tsx`、`frontend/src/shared/theme/LinearBackdrop.tsx`、`frontend/src/features/trial/`、`frontend/src/features/present/`、`frontend/src/fonts-serif.css`
- Modify：`frontend/src/app/AppShell.tsx`、`frontend/src/index.css`、所有用到 `cine:`／`lin:` 的元件、`frontend/src/features/intro/IntroPage.tsx`、`frontend/src/features/wizard/WizardPage.tsx`、`frontend/src/features/result/ResultPage.tsx`、`frontend/e2e/*.e2e.ts`（刪掉試用、簡報、三版切換的測試）

**Interfaces:**
- Produces：程式裡不再有 `data-proto`、`useProtoStore`、`useApplyProto`、`useTrialStore`、`PresentMode`、`cine:`、`lin:`。`AppShell` 暫時沒有主題（Task 4 補上）。

- [ ] **Step 1：列出所有引用**

```bash
cd ~/Desktop/JEV/ZeroGap/team-redesign/frontend
grep -rnE "shared/theme/(proto|LightTrails|LinearBackdrop)|ProtoSwitcher|features/(trial|present)|fonts-serif|data-proto|data-present|\bcine:|\blin:" src e2e index.html
```
把結果存成清單，下面每一步做完都重跑一次，最後要是空的。

- [ ] **Step 2：刪檔案**

```bash
git rm -r -q src/app/ProtoSwitcher.tsx src/shared/theme/proto.ts src/shared/theme/LightTrails.tsx src/shared/theme/LinearBackdrop.tsx src/features/trial src/features/present src/fonts-serif.css
```

- [ ] **Step 3：拿掉元件裡的 `cine:`、`lin:` 樣式**

這兩個是「只在 B／C 版生效」的 Tailwind 變體，刪掉不影響 A 版以外的畫面（A 版本來就沒有）：
```bash
grep -rlE "\b(cine|lin):" src | xargs perl -pi -e 's/\s+(?:cine|lin):[^\s"'"'"'`}]+//g; s/(["'"'"'`])(?:cine|lin):[^\s"'"'"'`}]+\s*/$1/g'
grep -rnE "\b(cine|lin):" src     # 必須沒有輸出
```

- [ ] **Step 4：`AppShell.tsx` 拿掉三版、簡報**

刪掉這幾行 import 和用法：`LightTrails`、`LinearBackdrop`、`useApplyProto`、`PresentMode`、`ProtoSwitcher`，以及 `const proto = useApplyProto()`、`{proto === 'cinematic' && …}`、`{proto === 'linear' && …}`、`<ProtoSwitcher />`、`<PresentMode />`。`useLocation` 沒用到了也刪。導覽列的「系統幕後」連結刪掉（路由留著，第 5 批換成新的幕後頁）。展示模式橫幅的文字改成：`展示模式：使用預先錄製的回應，不是即時查詢`（不再提「系統幕後」，因為導覽列沒有了；關閉方式仍是到 `/behind`）。

- [ ] **Step 5：拿掉試用模式的掛勾**

- `IntroPage.tsx`：刪 `TrialGate` 的 import 和 `<TrialGate … />`。
- `WizardPage.tsx`、`ResultPage.tsx`：刪 `useTrialStore`、`TrialSurvey` 的 import 和所有用到的地方（計時、問卷）。刪完 `npx tsc -b` 會指出剩下沒用到的變數，一併刪。
- `src/store/planStore.test.ts` 如果引用 `mergeTrialState`，刪掉那個 `it(...)`。

- [ ] **Step 6：`index.css` 刪三版 token**

刪掉：`[data-proto="cinematic"] { … }`、`[data-proto="linear"] { … }` 兩整塊、`zg-surface` 裡兩個 `[data-proto=…] & { … }`、`[data-proto="linear"] :is(h1, h2)`、`@custom-variant cine …`、`@custom-variant lin …`、`html[data-present] { … }`、`@import "@fontsource-variable/noto-serif-tc";`（如果還在 index.css）。`:root` 那塊先留著（Task 4 換掉）。

- [ ] **Step 7：刪掉三版、試用、簡報的測試**

```bash
grep -nE "proto=|ProtoSwitcher|試做|試用|trial=1|present=1|簡報模式|切換版本" e2e/*.e2e.ts
```
刪掉這些 `test(...)`／`test.describe(...)`；`a11y.e2e.ts` 裡「3 版 × 8 頁」的迴圈改成只掃一個版本（把 `for (const proto of [...])` 拿掉，網址不帶 `?proto=`）。

- [ ] **Step 8：檢查**

```bash
grep -rnE "shared/theme/(proto|LightTrails|LinearBackdrop)|ProtoSwitcher|features/(trial|present)|fonts-serif|data-proto|data-present|\b(cine|lin):" src e2e index.html   # 空的
npm run lint
npm run predemo
```
Expected：grep 沒有輸出；lint 0 錯誤；`✅ Demo 前檢查全部通過`。

- [ ] **Step 9：Commit**

```bash
git add -u src e2e
git commit -m "refactor(frontend): 拿掉 A/B/C 三版切換、試用模式、簡報快捷鍵

正式產品只留一個版本（規格 D6）。展示模式保留，Demo 現場的保險。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4：夜／日兩套主題

**Files:**
- Create：`frontend/src/shared/theme/theme.ts`、`frontend/src/shared/theme/theme.test.ts`、`frontend/src/shared/theme/ThemeToggle.tsx`、`frontend/e2e/foundation.e2e.ts`
- Modify：`frontend/src/index.css`（`:root` 換成日、新增 `[data-theme="night"]`）、`frontend/index.html`、`frontend/src/app/AppShell.tsx`

**Interfaces:**
- Produces：
  - `type ThemePref = 'system' | 'night' | 'day'`、`type Theme = 'night' | 'day'`
  - `resolveTheme(pref: ThemePref, systemDark: boolean): Theme`
  - `nextPref(pref: ThemePref): ThemePref`（system → night → day → system）
  - `useThemeStore`（persist 名稱 `zg-theme`，欄位 `pref`）
  - `useApplyTheme(): Theme`（在 `<html>` 設 `data-theme`、`.dark`、`color-scheme`、`<meta name="theme-color">`）
  - `<ThemeToggle />`
  - CSS 變數：沿用 shadcn 的 `--background` 等和 `--zg-*`，另外新增 `--zg-flow`（主色光）、`--zg-glow`（光暈）。

- [ ] **Step 1：寫失敗的單元測試**

`frontend/src/shared/theme/theme.test.ts`：
```ts
import { describe, expect, it } from 'vitest'
import { nextPref, resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('跟著手機：手機是深色就用夜', () => expect(resolveTheme('system', true)).toBe('night'))
  it('跟著手機：手機是淺色就用日', () => expect(resolveTheme('system', false)).toBe('day'))
  it('手動選了就不管手機', () => {
    expect(resolveTheme('day', true)).toBe('day')
    expect(resolveTheme('night', false)).toBe('night')
  })
})

describe('nextPref', () => {
  it('按一下依序換：跟著手機 → 夜 → 日 → 跟著手機', () => {
    expect(nextPref('system')).toBe('night')
    expect(nextPref('night')).toBe('day')
    expect(nextPref('day')).toBe('system')
  })
})
```

- [ ] **Step 2：確認失敗**

Run：`npx vitest run src/shared/theme/theme.test.ts`
Expected：FAIL，`Failed to resolve import "./theme"`。

- [ ] **Step 3：實作 `theme.ts`**

```ts
import { useEffect, useSyncExternalStore } from 'react'
import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { keepAsIs, pickValid, STORAGE_VERSION } from '@/store/persistSafe'

/*
 * 外觀（規格 4.1）：「夜」是錶盤夜（深色，跟簡報同一套），「日」是同一套語言的亮色版。
 * 預設跟著手機的深淺色設定；按右上角的按鈕可以手動指定，記在瀏覽器（zg-theme）。
 * index.html 開頁前有一小段程式先套上，避免深色模式的人先看到一閃白畫面。
 */
export type ThemePref = 'system' | 'night' | 'day'
export type Theme = 'night' | 'day'

export const THEME_PREFS: ThemePref[] = ['system', 'night', 'day']
export const THEME_LABEL: Record<ThemePref, string> = { system: '跟著手機', night: '夜', day: '日' }

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === 'system') return systemDark ? 'night' : 'day'
  return pref
}

export function nextPref(pref: ThemePref): ThemePref {
  return THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length]
}

export const useThemeStore = create<{ pref: ThemePref; setPref: (p: ThemePref) => void }>()(
  persist((set) => ({ pref: 'system', setPref: (pref) => set({ pref }) }), {
    name: 'zg-theme',
    version: STORAGE_VERSION,
    migrate: keepAsIs,
    merge: (persisted, current) => ({
      ...current,
      ...pickValid<{ pref: ThemePref }>(persisted, { pref: z.enum(['system', 'night', 'day']) }),
    }),
  }),
)

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')
const subscribe = (onChange: () => void) => {
  const q = darkQuery()
  q.addEventListener('change', onChange)
  return () => q.removeEventListener('change', onChange)
}
/** 手機現在是不是深色模式；使用者在系統設定切換時會即時更新 */
export const useSystemDark = () => useSyncExternalStore(subscribe, () => darkQuery().matches, () => true)

/** 把外觀寫到 <html>：data-theme 給 CSS 用、.dark 給 shadcn 的 dark: 變體用 */
export function useApplyTheme(): Theme {
  const pref = useThemeStore((s) => s.pref)
  const theme = resolveTheme(pref, useSystemDark())
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.classList.toggle('dark', theme === 'night')
    root.style.colorScheme = theme === 'night' ? 'dark' : 'light'
    const bg = getComputedStyle(root).getPropertyValue('--background').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  }, [theme])
  return theme
}
```

- [ ] **Step 4：確認通過**

Run：`npx vitest run src/shared/theme/theme.test.ts`
Expected：PASS（4 個）。

- [ ] **Step 5：`index.css` 換成夜／日 token**

把 `:root { … }`（原本 A 時刻表那塊）整塊換成下面兩塊，並把 `@custom-variant dark (&:is(.dark *));` 保留不動：
```css
/*
 * 外觀（規格 4.1）：日＝:root 預設、夜＝[data-theme="night"]。
 * 青色（--zg-flow）是唯一的主色，代表「接得上的路線」；緩衝的綠、藍、橘、紅是語意色，不是主色。
 */
:root {
  --background: #f4f7f9;
  --foreground: #0f1820;
  --card: #ffffff;
  --card-foreground: #0f1820;
  --popover: #ffffff;
  --popover-foreground: #0f1820;
  --primary: #0b7285;
  --primary-foreground: #ffffff;
  --secondary: #e8eef2;
  --secondary-foreground: #0f1820;
  --muted: #e8eef2;
  --muted-foreground: #52606d;
  --accent: #dcf1f4;
  --accent-foreground: #0f1820;
  --destructive: #b42318;
  --border: #d6dee5;
  --input: #d6dee5;
  --ring: #0b7285;
  --radius: 0.75rem;

  --zg-flow: #0b7285;
  --zg-glow: rgb(11 114 133 / 0.18);
  --zg-ok: #1e7a4c;
  --zg-ok-soft: #e3f1e9;
  --zg-snug: #2f5d8a;
  --zg-snug-soft: #e5edf6;
  --zg-tight: #b4520f;
  --zg-tight-soft: #fbebdd;
  --zg-fail: #b42318;
  --zg-fail-soft: #fde8e6;
  --zg-est-bg: #fff1b8;
  --zg-est-ink: #6b4e00;

  --zg-heading-font: var(--font-sans);
  --zg-num-font: var(--font-mono);
  --zg-body-font: var(--font-sans);
  --zg-chart-keep: #0b7285;
  --zg-chart-drop: #8a96a3;
}

[data-theme="night"] {
  color-scheme: dark;
  --background: #0b1016;
  --foreground: #eaf1f6;
  --card: #121a23;
  --card-foreground: #eaf1f6;
  --popover: #141d27;
  --popover-foreground: #eaf1f6;
  --primary: #62d6e8;
  --primary-foreground: #04222a;
  --secondary: #172230;
  --secondary-foreground: #eaf1f6;
  --muted: #152029;
  --muted-foreground: #8a9aa9;
  --accent: rgb(98 214 232 / 0.14);
  --accent-foreground: #eaf1f6;
  --destructive: #ff6b6b;
  --border: #223040;
  --input: #2a3a4c;
  --ring: #62d6e8;

  --zg-flow: #62d6e8;
  --zg-glow: rgb(98 214 232 / 0.35);
  --zg-ok: #7fe0a6;
  --zg-ok-soft: rgb(127 224 166 / 0.12);
  --zg-snug: #7cc4ff;
  --zg-snug-soft: rgb(124 196 255 / 0.12);
  --zg-tight: #ffb547;
  --zg-tight-soft: rgb(255 181 71 / 0.14);
  --zg-fail: #ff6b6b;
  --zg-fail-soft: rgb(255 107 107 / 0.14);
  --zg-est-bg: rgb(255 214 10 / 0.2);
  --zg-est-ink: #ffe27a;
  --zg-chart-keep: #62d6e8;
  --zg-chart-drop: #5b6878;
}
```
在 `@theme inline { … }` 裡加兩行：`--color-zg-flow: var(--zg-flow);`、`--color-zg-glow: var(--zg-glow);`。
`zg-surface` 加夜的樣式（取代剛刪掉的三版樣式）：
```css
  [data-theme="night"] & {
    box-shadow: 0 1px 0 rgb(255 255 255 / 0.04) inset, 0 18px 40px -24px rgb(0 0 0 / 0.7);
  }
```

- [ ] **Step 6：`index.html` 開頁前先套主題**

把 `<meta name="theme-color" content="#f7f6f2" />` 改成 `#f4f7f9`，並在它下面加：
```html
    <!-- 外觀（規格 4.1）：React 載入前先套上，深色模式的人不會先看到一閃白畫面。邏輯和 src/shared/theme/theme.ts 的 resolveTheme 一樣 -->
    <script>
      try {
        var pref = (JSON.parse(localStorage.getItem('zg-theme') || '{}').state || {}).pref || 'system'
        var night = pref === 'night' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
        document.documentElement.dataset.theme = night ? 'night' : 'day'
        if (night) document.documentElement.classList.add('dark')
      } catch (e) {}
    </script>
```

- [ ] **Step 7：切換鈕 `ThemeToggle.tsx`**

```tsx
import { Moon, MonitorSmartphone, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { nextPref, THEME_LABEL, useThemeStore } from './theme'

const ICON = { system: MonitorSmartphone, night: Moon, day: Sun } as const

/** 右上角的外觀按鈕：跟著手機 → 夜 → 日，依序切換 */
export function ThemeToggle() {
  const pref = useThemeStore((s) => s.pref)
  const setPref = useThemeStore((s) => s.setPref)
  const Icon = ICON[pref]
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      onClick={() => setPref(nextPref(pref))}
      aria-label={`外觀：${THEME_LABEL[pref]}，按一下換成${THEME_LABEL[nextPref(pref)]}`}
      title={`外觀：${THEME_LABEL[pref]}`}
    >
      <Icon aria-hidden />
    </Button>
  )
}
```
`AppShell.tsx`：最上面加 `useApplyTheme()`（import 自 `@/shared/theme/theme`），導覽列右側放 `<ThemeToggle />`。

- [ ] **Step 8：寫流程測試**

`frontend/e2e/foundation.e2e.ts`：
```ts
import { expect, test } from '@playwright/test'

test.describe('外觀：夜／日', () => {
  test('手機是深色模式時，第一次打開就是夜', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  })

  test('手機是淺色模式時是日；按外觀鈕依序換成夜、日，重新整理後還記得', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'day')
    await page.getByRole('button', { name: /^外觀：跟著手機/ }).click()
    await expect(html).toHaveAttribute('data-theme', 'night')
    await page.getByRole('button', { name: /^外觀：夜/ }).click()
    await expect(html).toHaveAttribute('data-theme', 'day')
    await page.reload()
    await expect(html).toHaveAttribute('data-theme', 'day')
    await expect(page.getByRole('button', { name: /^外觀：日/ })).toBeVisible()
  })
})
```

- [ ] **Step 9：跑測試**

Run：`npx playwright test e2e/foundation.e2e.ts`
Expected：三個瀏覽器各 2 條，共 6 passed。

- [ ] **Step 10：兩套主題都掃無障礙**

在 `e2e/a11y.e2e.ts` 的頁面迴圈外面包一層 `for (const scheme of ['light', 'dark'] as const)`，每次 `await page.emulateMedia({ colorScheme: scheme })` 後再 `goto`，測試名稱帶上 `日`／`夜`。
Run：`npx playwright test e2e/a11y.e2e.ts --project=chromium`
Expected：全部通過、零嚴重問題。對比不足的話，**只調 `index.css` 的 token**（例如把 `--muted-foreground` 調深／調亮），不在元件裡寫死顏色。

- [ ] **Step 11：全套＋commit**

```bash
npm run predemo
git add src/shared/theme/theme.ts src/shared/theme/theme.test.ts src/shared/theme/ThemeToggle.tsx src/index.css index.html src/app/AppShell.tsx e2e/foundation.e2e.ts e2e/a11y.e2e.ts
git commit -m "feat(frontend): 夜／日兩套外觀，預設跟著手機、可手動切換

夜＝錶盤夜（跟發表會簡報同一套），日＝同一套語言的亮色版；開頁前先套上，不閃白。
無障礙掃描兩套都跑。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5：字體換成跟簡報一致

**Files:**
- Modify：`frontend/package.json`、`frontend/package-lock.json`、`frontend/src/fonts.css`、`frontend/src/index.css`（`@theme inline` 的字體變數）
- 刪除套件：`@fontsource-variable/noto-serif-tc`、`@fontsource-variable/inter`、`@fontsource-variable/jetbrains-mono`

**Interfaces:**
- Produces：Tailwind 字體 `font-sans`（思源黑體）、`font-num`（Archivo，大數字）、`font-mono`（IBM Plex Mono，時刻）；utility `zg-num`（時刻、金額，等寬）、`zg-figure`（大數字）。

- [ ] **Step 1：換套件**

```bash
cd ~/Desktop/JEV/ZeroGap/team-redesign/frontend
npm uninstall @fontsource-variable/noto-serif-tc @fontsource-variable/inter @fontsource-variable/jetbrains-mono
npm install --save-exact @fontsource-variable/archivo@5.3.0 @fontsource/ibm-plex-mono@5.3.0
grep -nE '"@fontsource' package.json
```
Expected：只剩 `noto-sans-tc`（原本的 `^5.3.1`）、`archivo` `5.3.0`、`ibm-plex-mono` `5.3.0`。

- [ ] **Step 2：`fonts.css`（非同步載入，`main.tsx` 已經 `void import('./fonts.css')`）**

整個檔案換成：
```css
/*
 * 字型宣告（優化計畫 P2-4）：@font-face 有幾百條，放在 index.css 會擋住第一個畫面，
 * 所以拆出來由 main.tsx 非同步載入。字型本來就是「先用系統字型、下載好再換」，晚一點載入不會閃版面。
 * 三套字型跟發表會簡報的動畫頁一致（規格 4.1）：思源黑體寫字、Archivo 寫大數字、IBM Plex Mono 寫時刻。
 */
@import "@fontsource-variable/noto-sans-tc";
@import "@fontsource-variable/archivo";
@import "@fontsource/ibm-plex-mono/400.css";
@import "@fontsource/ibm-plex-mono/600.css";
```
確認 `index.css` 裡沒有任何 `@import "@fontsource…"`（有就刪，字型只能從 fonts.css 載入）。

- [ ] **Step 3：`index.css` 的字體變數**

`@theme inline` 裡的字體四行換成：
```css
  --font-sans: "Noto Sans TC Variable", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --font-num: "Archivo Variable", "Noto Sans TC Variable", system-ui, sans-serif;
  --font-heading: var(--zg-heading-font);
```
刪掉 `--font-serif`、`--font-inter`、原本的 `--font-num: var(--zg-num-font);`。在 `zg-num` 下面加：
```css
/* 大數字（組合數、方案數）：Archivo，跟簡報一致 */
@utility zg-figure {
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  letter-spacing: -0.02em;
}
```
```bash
grep -rnE "font-serif|font-inter|Inter Variable|JetBrains|Noto Serif" src    # 必須沒有輸出；有的話改成 font-sans 或 font-mono
```

- [ ] **Step 4：量首頁載入時間**

```bash
npm run build && npm run perf
```
Expected：報告的慢速 4G 首頁 LCP < 2.0 秒（`scripts/measure-perf.mjs` 會印出數字）。超過的話先檢查 `dist/assets/index-*.css` 有沒有混進 `@font-face`（`grep -c font-face dist/assets/index-*.css` 應該是 0）。

- [ ] **Step 5：全套＋commit**

```bash
npm run predemo
git add package.json package-lock.json src/fonts.css src/index.css
git add -u src            # 只會是 Step 3 改掉 font-serif／font-inter 的元件
git commit -m "feat(frontend): 字體換成思源黑體＋Archivo＋IBM Plex Mono，跟簡報一致

新增 @fontsource-variable/archivo 5.3.0、@fontsource/ibm-plex-mono 5.3.0（固定版號，使用者 11/07 同意）；
拿掉用不到的明體、Inter、JetBrains Mono。字型仍是非同步載入，不擋第一個畫面。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6：新外框（導覽列、手機底部導覽、頁尾）

**Files:**
- Create：`frontend/src/app/SiteFooter.tsx`、`frontend/src/app/BottomNav.tsx`
- Modify：`frontend/src/app/AppShell.tsx`、`frontend/e2e/foundation.e2e.ts`

**Interfaces:**
- Consumes：`getStatus()`（`@/api/client`，回傳 `StatusResponse`，`data_updated_at: Record<string, string | null>`）、`ThemeToggle`、`useApplyTheme`（Task 4）。
- Produces：`<SiteFooter />`、`<BottomNav />`；之後第 5 批加頁面時，只要在 `NAV_ITEMS`（`BottomNav.tsx` 匯出）加一筆，頂部和底部導覽會一起出現。

導覽列這一批只放已經存在的頁面：「排行程」。方法、AI 助理、關於在第 5 批頁面做好時才加進 `NAV_ITEMS`（不放「即將推出」的空頁）。

- [ ] **Step 1：先寫流程測試（會失敗）**

在 `frontend/e2e/foundation.e2e.ts` 後面加：
```ts
test.describe('外框', () => {
  test('頁尾寫出資料更新時間和資料來源', async ({ page }) => {
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    await expect(footer).toContainText('資料更新')
    await expect(footer).toContainText('交通部 TDX')
    await expect(footer.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/RyanWu9863/ZeroGap')
  })

  test('手機底部有導覽，點「排行程」進到精靈第一步', async ({ page, isMobile }) => {
    test.skip(!isMobile, '底部導覽只在手機寬度出現')
    await page.goto('/')
    const bottom = page.getByRole('navigation', { name: '主要頁面（底部）' })
    await expect(bottom).toBeVisible()
    await bottom.getByRole('link', { name: '排行程' }).click()
    await expect(page).toHaveURL(/\/plan\/1/)
  })

  test('電腦版頂部有導覽，沒有底部導覽', async ({ page, isMobile }) => {
    test.skip(isMobile, '只看電腦寬度')
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: '主要頁面' }).getByRole('link', { name: '排行程' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '主要頁面（底部）' })).toBeHidden()
  })
})
```
Run：`npx playwright test e2e/foundation.e2e.ts -g 外框`
Expected：FAIL（找不到「資料更新」、找不到底部導覽）。

- [ ] **Step 2：`BottomNav.tsx`**

```tsx
import { CalendarClock, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'

/** 導覽項目：頂部和手機底部共用。第 5 批加方法、AI 助理、關於時在這裡加 */
export const NAV_ITEMS: { to: string; label: string; icon: LucideIcon; match: (path: string) => boolean }[] = [
  { to: '/plan/1', label: '排行程', icon: CalendarClock, match: (p) => p.startsWith('/plan') || p.startsWith('/result') || p.startsWith('/p/') },
]

/** 手機底部導覽：sm 以上隱藏；底部留出 iPhone 橫條的安全區域 */
export function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="主要頁面（底部）"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {NAV_ITEMS.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <li key={to}>
              <NavLink
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 px-3 text-xs ${active ? 'text-primary font-medium' : 'text-muted-foreground'}`}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 3：`SiteFooter.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query'
import { getStatus } from '@/api/client'

/** 頁尾（規格 3.1）：資料多新、從哪來、原始碼。拿不到更新時間就不顯示那一行，不擋畫面 */
export function SiteFooter() {
  const { data } = useQuery({ queryKey: ['status'], queryFn: ({ signal }) => getStatus(signal), staleTime: 5 * 60_000 })
  const times = Object.values(data?.data_updated_at ?? {}).filter((t): t is string => !!t)
  const latest = times.length ? new Date(Math.max(...times.map((t) => Date.parse(t)))) : null
  return (
    <footer className="mx-auto grid max-w-6xl gap-2 px-4 pb-28 pt-16 text-xs text-muted-foreground sm:px-6 sm:pb-12">
      {latest && (
        <p>
          資料更新：
          <time dateTime={latest.toISOString()} className="zg-num">
            {latest.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
          </time>
        </p>
      )}
      <p>交通：交通部 TDX 運輸資料流通服務・電影場次：開眼電影網・餐廳：OpenStreetMap、Google 地圖</p>
      <p>
        ZeroGap 零空檔・資策會 AIAE1 第一組專題・
        <a href="https://github.com/RyanWu9863/ZeroGap" className="underline underline-offset-2 hover:text-foreground" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
    </footer>
  )
}
```
（假資料模式下 `getStatus` 由 `mocks/server.ts` 回傳，`data_updated_at` 跟著今天走，所以測試看得到「資料更新」。）

- [ ] **Step 4：`AppShell.tsx` 換成新外框**

```tsx
import { MotionConfig } from 'motion/react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { USE_MOCK } from '@/api/client'
import { Logo } from '@/shared/brand/Logo'
import { ThemeToggle } from '@/shared/theme/ThemeToggle'
import { useApplyTheme } from '@/shared/theme/theme'
import { useDemoStore } from '@/store/demoStore'
import { BottomNav, NAV_ITEMS } from './BottomNav'
import { SiteFooter } from './SiteFooter'

/** 每一頁共用的外框：頂部導覽（電腦）＋內容＋頁尾＋底部導覽（手機） */
export function AppShell() {
  useApplyTheme()
  const { pathname } = useLocation()
  const demo = useDemoStore((s) => s.demo)
  return (
    <MotionConfig reducedMotion="user">
      {demo && (
        <div className="bg-zg-tight px-4 py-1.5 text-center text-xs font-medium text-background" role="status" style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top, 0px))' }}>
          展示模式：使用預先錄製的回應，不是即時查詢
        </div>
      )}
      <header className="sticky z-40 border-b bg-background/80 backdrop-blur-md" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link to="/" aria-label="ZeroGap 零空檔 首頁">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {USE_MOCK && (
              <span className="mr-1 hidden rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">假資料（開發用）</span>
            )}
            <nav aria-label="主要頁面" className="hidden sm:block">
              <ul className="flex items-center gap-1">
                {NAV_ITEMS.map(({ to, label, match }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      aria-current={match(pathname) ? 'page' : undefined}
                      className={`rounded-md px-3 py-2 text-sm transition-colors hover:text-foreground ${match(pathname) ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                    >
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <SiteFooter />
      <BottomNav pathname={pathname} />
      <ScrollRestoration />
    </MotionConfig>
  )
}
```
注意：`NavLink` 自己也會加 `aria-current`，這裡用 `match` 是因為 `/result`、`/p/:id` 也算「排行程」這一區。

- [ ] **Step 5：手機底部導覽會不會擋到內容**

精靈、結果頁原本有固定在底部的按鈕列（`fixed bottom-0`）。列出來：
```bash
grep -rn "fixed.*bottom-0\|bottom-0.*fixed" src --include=*.tsx | grep -v BottomNav
```
每一個在手機寬度都改成 `bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-0`（底部導覽高 3.5rem），避免疊在一起。

- [ ] **Step 6：跑測試**

```bash
npx playwright test e2e/foundation.e2e.ts
npx playwright test --project=iphone
```
Expected：foundation 全部通過；iPhone 專案全部通過（底部導覽沒有擋到「排出接得上的行程」等按鈕）。

- [ ] **Step 7：全套＋commit**

```bash
npm run predemo
git add src/app/AppShell.tsx src/app/SiteFooter.tsx src/app/BottomNav.tsx e2e/foundation.e2e.ts
git add -u src            # Step 5 調整位置的元件
git commit -m "feat(frontend): 新外框：電腦頂部導覽、手機底部導覽、頁尾寫資料更新時間與來源

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7：前端 CI＋修偶發失敗的測試

**Files:**
- Create：`.github/workflows/frontend-ci.yml`（repo 根目錄）
- Delete：`frontend/.github/`（放在子資料夾 GitHub 不會執行，只會讓人誤會）
- Modify：`frontend/e2e/flows.e2e.ts`（「目前位置離商圈太遠」）

**Interfaces:**
- Produces：PR 和推到 `main` 時，只要 `frontend/**` 有改動，就在 Ubuntu、Windows 各跑一次型別、lint、單元測試、打包、Chromium 流程測試。

- [ ] **Step 1：修偶發測試**

原因（2026-11-07 查到）：按下「使用目前位置」之後馬上 `goto('/plan/4')`，有時定位還沒存進條件就換頁了（單獨重跑 9 次都會過）。改成等畫面確認已經選好目前位置再換頁。`e2e/flows.e2e.ts` 的這條改成：
```ts
  test('後端回 400，畫面說明並請改選出發站', async ({ page }) => {
    await page.goto('/plan/1')
    await page.getByRole('button', { name: /使用目前位置/ }).click()
    // 等定位寫進條件（zg-plan 暫存有 origin_lat）再換頁，不然有時會帶著舊的出發站
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('zg-plan') ?? '{}').state?.request?.origin_lat ?? null)).not.toBeNull()
    await page.goto('/plan/4')
    await page.getByRole('button', { name: '排出接得上的行程' }).click()
    await expect(page.getByText('目前位置離這個商圈超過 30 公里，請改選出發站')).toBeVisible()
  })
```
驗證：`npx playwright test -g "目前位置離商圈太遠" --repeat-each=10`
Expected：30 passed。

- [ ] **Step 2：新增 CI**

`.github/workflows/frontend-ci.yml`：
```yaml
# 前端檢查：frontend/ 有改動的 PR 和推到 main 時，在 Ubuntu、Windows 各跑一次
# （組員用 Mac 和 Windows 開發；Mac 靠本機的 npm run predemo，因為私人 repo 的 macOS 分鐘數算 10 倍）
name: Frontend CI

on:
  pull_request:
    paths: ['frontend/**', '.github/workflows/frontend-ci.yml']
  push:
    branches: [main]
    paths: ['frontend/**', '.github/workflows/frontend-ci.yml']

concurrency:
  group: frontend-ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npx tsc -b
      - run: npm run lint
      - run: npm test
      - run: npx vite build
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --project=chromium
```
```bash
cd ~/Desktop/JEV/ZeroGap/team-redesign
git rm -r -q frontend/.github
```

- [ ] **Step 3：本機先跑一次 CI 會跑的指令**

```bash
cd frontend && npx tsc -b && npm run lint && npm test && npx vite build && npx playwright test --project=chromium
```
Expected：全部通過。

- [ ] **Step 4：全套＋commit**

```bash
npm run predemo
cd .. && git add .github/workflows/frontend-ci.yml frontend/e2e/flows.e2e.ts
git commit -m "ci(frontend): 新增前端 CI（Ubuntu、Windows）；修好定位測試偶發失敗

frontend/.github 放在子資料夾 GitHub 不會執行，刪掉避免誤會。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8：文件、推分支、開 PR

**Files:**
- Create：`frontend/docs/導讀_08_地基.md`
- Modify：`frontend/README.md`、`docs/superpowers/specs/2026-11-07-frontend-redesign-design.md`（第 9 節）、這份計畫（最下面的進度表）

- [ ] **Step 1：寫導讀 `frontend/docs/導讀_08_地基.md`**

用白話和比喻寫，章節固定如下，每節 3～8 行：
1. **這一批做了什麼**（一段話：把優化版整條搬進來、只留一個版本、夜／日、新字體、新外框、CI）
2. **為什麼整條合併，不一個一個搬**（比喻：搬家時整個房間打包，比一件一件拆好；附 11/07 試搬 11 個檔出現 5 個型別錯誤、整條合併零衝突的事實）
3. **夜和日怎麼運作**（`theme.ts` 三個函式、`index.html` 開頁前那段、`zg-theme` 暫存、CSS 只改 token 不改元件）
4. **字體**（三套字各管什麼、為什麼非同步載入、`npm run perf` 的實際數字）
5. **外框**（頂部／底部導覽共用 `NAV_ITEMS`、第 5 批怎麼加頁面、頁尾的資料來源）
6. **測試和 CI**（`npm run predemo`、`frontend-ci.yml` 跑什麼、偶發測試的原因和修法）
7. **還留著、之後會處理的**（`?exp=1` 到第 4 批、展示模式和 `/behind` 到第 5 批）

- [ ] **Step 2：更新 README 和規格**

- `frontend/README.md`：拿掉 `?proto=`、`?trial=1`、`?present=1` 的說明；加「外觀：右上角切換夜／日」、`npm run perf`、導讀 08 的連結。
- 規格第 9 節已在寫計畫時更新（整條合併、保留展示模式），這一步只要確認內容和實際做的一致；有出入就照實際修正。

- [ ] **Step 3：更新下面的進度表、commit**

```bash
cd ~/Desktop/JEV/ZeroGap/team-redesign/frontend && npm run predemo
cd .. && git add frontend/docs/導讀_08_地基.md frontend/README.md docs/superpowers/specs/2026-11-07-frontend-redesign-design.md docs/superpowers/plans/2026-11-07-frontend-batch2-foundation.md
git commit -m "docs(frontend): 導讀 08 地基；README、規格、計畫進度表更新

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4：推分支（團隊 repo 是公開的，推分支不會發布，合併到 main 才會）**

```bash
git push -u origin feat/frontend-foundation
```
（https 推不上去時，改用 SSH：`git push -u git@github.com:RyanWu9863/ZeroGap.git feat/frontend-foundation`。）

- [ ] **Step 5：開 PR，不合併**

```bash
gh pr create -R RyanWu9863/ZeroGap --base main --head feat/frontend-foundation \
  --title "前端重新設計 第 2 批：地基（合併優化版、只留一版、夜／日、新字體、新外框、CI）" \
  --body-file "${TMPDIR:-/tmp}/zg-pr-body.md"
```
`${TMPDIR:-/tmp}/zg-pr-body.md` 內容：這一批做了什麼（照導讀第 1 節）、commit 清單（`git log --oneline origin/main..HEAD`）、怎麼測（`npm run predemo` 結果、`npm run perf` 數字）、**合併後會自動更新 GitHub Pages 展示站**、規格和計畫的路徑，最後一行 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
開完 PR 回報網址給使用者，**等使用者說可以再合併**。

---

## 進度表

| Task | 狀態 |
|---|---|
| 1 integrate 追上優化版最新 | ✅ 5a355fe（私人 repo） |
| 2 合併進團隊 frontend/ | ✅ 97ccf41 |
| 3 刪三版、試用、簡報 | ✅ 4e1c132 |
| 4 夜／日主題 | ✅ bc78334 |
| 5 字體 | ✅ 941a662 |
| 6 外框 | ✅ 9ef1b05、d8333ab |
| 7 CI＋偶發測試 | ✅ e8e922c |
| 8 文件、PR | 文件已完成；推分支、開 PR 待最終審查後 |

## 之後的計畫（各自另寫）

- 子專案 ① 連結取餐號：短規格＋計畫（後端 `GET /api/plans/{id}`、Redis 7 天、MCP `share_url`、規格書 v0.21）。
- 第 3 批：首頁＋點陣剪枝＋快速條件。
- 第 4 批：排程中漏斗＋結果頁錶盤＋分享頁＋地圖＋「怎麼來的」；拿掉 `?exp=1`。
- 第 5 批：方法、AI 助理、關於、幕後頁（展示模式開關搬過去）。
