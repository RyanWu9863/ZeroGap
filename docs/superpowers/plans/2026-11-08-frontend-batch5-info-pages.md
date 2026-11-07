# 前端重新設計 第 5 批「方法、AI 助理、關於、幕後」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補齊規格 3.1 剩下的頁面：導覽列四顆（排行程、方法、AI 助理、關於），新做 `/method`（捲動解說，一關一個真數字）、`/ai`（怎麼在 AI 助理裡接上 ZeroGap）、`/about`（團隊、資料來源授權、隱私），把 `/behind` 用夜主題重畫成上台用的幕後頁（漏斗、桑基圖、決策表、MCP 工具和一次呼叫的流程、資料狀態、展示模式開關）；順手找出首頁「排行程」在負載下偶爾沒反應的原因。

**Architecture:** 每一頁一個資料夾、延遲載入的路由；頁面要的數字和網址都先寫成純函式加單元測試（`methodFacts`、`mcpUrl`、`navItems`、儲存清單），畫面元件只負責畫。方法頁和幕後頁的示範數字一律來自 `src/api/__fixtures__/backend-plan-result.json`（真後端跑出來的結果），不再用假資料的 `mockResult`。幕後頁在自己的外框上設 `data-theme="night"` 和 `dark`，不管使用者選什麼外觀都是夜。

**Tech Stack:** React 19、React Router 8（lazy 路由）、TypeScript、Tailwind v4、Motion（`whileInView`，內部用 IntersectionObserver）、Recharts（只在幕後頁、延遲載入）、TanStack Query（`useStatus`）、Zustand、zod 4、Vitest、Playwright、axe。**不加新套件。**

**Spec:** `docs/superpowers/specs/2026-11-07-frontend-redesign-design.md`（3.1 網站地圖和導覽、4.5 方法頁、4.6 動態和效能、6 幕後頁、9「暫留：舊的 `features/behind`」和展示模式、10 測試、11 第 5 批）。MCP 工具以 `backend/app/mcp.py` 為準（6 個工具、`/mcp`、無狀態 streamable HTTP）。

## Global Constraints

- 工作資料夾 `~/Desktop/JEV/ZeroGap/team-redesign`，分支 **`feat/info-pages`**，從 `feat/result-page`（PR #7）開。PR 的 base 是 `feat/result-page`；合併順序 #3 → #6 → #7 → 這批。
- 導覽列（規格 3.1）：四顆，順序固定 **排行程、方法、AI 助理、關於**；電腦版在頂部，手機版在底部（`sm` 以下）。`/behind` **不放**進導覽列和頁尾。
- 文案用字規則：
  - `/method`、`/about`、結果頁、首頁：不出現 **AI、Jev、LLM、機率**。
  - `/ai`：可以講「AI 助理」「MCP」，但不出現 **Jev、LLM、機率**。
  - `/behind`：什麼都可以講（Jev、LLM、機率、MCP）。
- 方法頁（規格 4.5）：一道關卡一個畫面，往下捲時展開；每一關配**一個真數字**，來自 `backend-plan-result.json` 的第 1 個方案；講通用原理：怎麼算緩衝、為什麼要查最早到和最晚走的車、資料從哪來、多久更新一次。**不編造每一關剔除幾組**（D14）。
- 幕後頁（規格 6）：夜主題；漏斗、桑基圖、決策表；直接講 Jev 機率（`probabilities`）、哪些題目交給 LLM 代選（`decided_by`）、MCP 工具清單和一次呼叫的流程；資料用這台瀏覽器最近一次排程，沒有就用示範範例並標「示範」；展示模式開關留在這頁。
- MCP 工具名稱（照 `backend/app/mcp.py`，一字不改）：`list_areas`、`search_locations`、`list_stations`、`list_categories`、`data_coverage`、`plan_date`；網址是後端的 `/mcp`。
- 不編造團隊成員姓名：關於頁寫「資策會 AIAE1 第一組」，成員連到 GitHub 的 contributors 頁 `https://github.com/RyanWu9863/ZeroGap/graphs/contributors`。
- Recharts 只在幕後頁用、延遲載入；每個動畫都有文字版；`prefers-reduced-motion` 時直接顯示最後一格（全部內容一次看得到）。
- 慢速 4G 首頁 LCP < 2.0 秒（`npm run perf`）；新頁面全部延遲載入，不能進首頁的包。
- 繁體中文、白話；每個 commit 前 `cd frontend && npm run predemo` 全過；只 add 自己改的檔案、不用 `git add -A`；不要 add `.vite.integrate.local.ts`、`.superpowers/`；commit 訊息繁體中文，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不推送、不開 PR，直到 Task 9；開 PR 後**不合併**（合併會更新公開的展示站，要先問使用者）。文件裡不能出現任何個人 email。
- 跟時間有關的測試一律固定時鐘（單元測試傳 `now`，Playwright 用 `page.clock.setFixedTime`）。

## 檔案地圖

| 路徑 | 做什麼 |
|---|---|
| `frontend/src/app/navItems.ts`＋`.test.ts` | Task 1：四顆導覽的資料和「目前在哪一頁」的判斷（從 `BottomNav.tsx` 搬出來） |
| `frontend/src/app/BottomNav.tsx`、`AppShell.tsx`、`SiteFooter.tsx`、`router.tsx` | Task 1：四顆導覽、頁尾連結、三個新路由 |
| `frontend/src/features/method/methodFacts.ts`＋`.test.ts` | Task 2：方法頁的真數字 |
| `frontend/src/features/method/MethodPage.tsx`、`MethodStep.tsx` | Task 3：捲動解說 |
| `frontend/src/features/ai/mcpUrl.ts`＋`.test.ts`、`AiPage.tsx` | Task 4：AI 助理頁 |
| `frontend/src/features/about/AboutPage.tsx`、`storageKeys.ts`＋`.test.ts` | Task 5：關於頁、這個網站在你的瀏覽器存了什麼 |
| `frontend/src/features/behind/*` | Task 6：幕後頁重畫（夜主題、MCP 流程、示範範例改用真後端結果） |
| `frontend/src/features/home/QuickPlanForm.tsx` | Task 7：「排行程」負載下偶爾沒反應 |
| `frontend/e2e/info.e2e.ts`（新）、`a11y.e2e.ts`、`foundation.e2e.ts` | Task 1、3～8 |
| `frontend/docs/導讀_12_方法AI關於幕後.md`、`README.md`、`.env.example`、規格第 9、11 節、這份計畫的進度表 | Task 8 |

---

### Task 1：導覽四顆、頁尾連結、三個新路由的骨架

**Files:**
- Create：`frontend/src/app/navItems.ts`、`frontend/src/app/navItems.test.ts`、`frontend/src/features/method/MethodPage.tsx`、`frontend/src/features/ai/AiPage.tsx`、`frontend/src/features/about/AboutPage.tsx`（這三頁先只有標題，Task 3～5 補內容）、`frontend/e2e/info.e2e.ts`
- Modify：`frontend/src/app/BottomNav.tsx`（拿掉 `NAV_ITEMS`，改 import）、`frontend/src/app/AppShell.tsx`、`frontend/src/app/SiteFooter.tsx`、`frontend/src/app/router.tsx`

**Interfaces:**
- Produces：`NAV_ITEMS: NavItem[]`、`type NavItem = { to: string; label: string; icon: LucideIcon; match: (path: string) => boolean }`、`activeNav(path: string): string | null`（回傳 `to`）；路由 `/method`、`/ai`、`/about`（lazy）；三個頁面元件 `MethodPage`、`AiPage`、`AboutPage`（具名 export）。

- [ ] **Step 1：先寫測試** `navItems.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { activeNav, NAV_ITEMS } from './navItems'

describe('導覽四顆（規格 3.1）', () => {
  it('順序：排行程、方法、AI 助理、關於', () => {
    expect(NAV_ITEMS.map((n) => n.label)).toEqual(['排行程', '方法', 'AI 助理', '關於'])
    expect(NAV_ITEMS.map((n) => n.to)).toEqual(['/plan/1', '/method', '/ai', '/about'])
  })
  it.each([
    ['/plan/2', '/plan/1'],
    ['/result', '/plan/1'],
    ['/p/0123456789abcdef0123456789abcdef', '/plan/1'],
    ['/method', '/method'],
    ['/ai', '/ai'],
    ['/about', '/about'],
    ['/', null],
    ['/behind', null],
    ['/aix', null],
  ])('%s → %s', (path, to) => expect(activeNav(path)).toBe(to))
})
```

- [ ] **Step 2：跑測試看它失敗**：`cd frontend && npx vitest run src/app/navItems.test.ts` → 找不到模組。

- [ ] **Step 3：`navItems.ts`**

```ts
import { BookOpen, Bot, CalendarClock, Info, type LucideIcon } from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; match: (path: string) => boolean }

const page = (p: string) => (path: string) => path === p || path.startsWith(`${p}/`)

/** 導覽項目（規格 3.1）：頂部（電腦）和底部（手機）共用；/behind 故意不列 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/plan/1', label: '排行程', icon: CalendarClock, match: (p) => p.startsWith('/plan') || p.startsWith('/result') || p.startsWith('/p/') },
  { to: '/method', label: '方法', icon: BookOpen, match: page('/method') },
  { to: '/ai', label: 'AI 助理', icon: Bot, match: page('/ai') },
  { to: '/about', label: '關於', icon: Info, match: page('/about') },
]

export function activeNav(path: string): string | null {
  return NAV_ITEMS.find((n) => n.match(path))?.to ?? null
}
```

- [ ] **Step 4：接上畫面**
  - `BottomNav.tsx`、`AppShell.tsx` 改從 `./navItems` 拿 `NAV_ITEMS`；`aria-current` 用 `activeNav(pathname) === to`。手機底部四顆在 375px 要放得下：每顆 `min-w-16`、字 `text-xs`，`ul` 用 `justify-around`，不換行。
  - `SiteFooter.tsx` 加一行頁面連結：「方法・在 AI 助理裡使用・關於」（`Link` 到 `/method`、`/ai`、`/about`），不放 `/behind`。
  - `router.tsx` 在 `/behind` 前面加三個 lazy 路由，寫法照現有的 `/behind`：

```tsx
{
  path: '/method',
  lazy: async () => ({ Component: (await import('@/features/method/MethodPage')).MethodPage }),
  hydrateFallbackElement: <PageLoading />,
},
{
  path: '/ai',
  lazy: async () => ({ Component: (await import('@/features/ai/AiPage')).AiPage }),
  hydrateFallbackElement: <PageLoading />,
},
{
  path: '/about',
  lazy: async () => ({ Component: (await import('@/features/about/AboutPage')).AboutPage }),
  hydrateFallbackElement: <PageLoading />,
},
```

  - 三個頁面先放一個 `h1`（方法頁「我們怎麼確定每一段都接得上」、AI 頁「在 AI 助理裡使用 ZeroGap」、關於頁「關於 ZeroGap」）和 `usePageTitle('方法' | 'AI 助理' | '關於')`。外框照其他頁：`mx-auto max-w-3xl px-4 pt-10 sm:px-6`（方法頁 `max-w-4xl`）。
  - 路由檔最上面的註解把網址清單補上 `/method`、`/ai`、`/about`。

- [ ] **Step 5：流程測試** `e2e/info.e2e.ts`

```ts
import { expect, test } from '@playwright/test'

test.describe('導覽四顆', () => {
  test('電腦：頂部四顆，點了換頁、目前那顆有標示；沒有幕後', async ({ page, isMobile }) => {
    test.skip(isMobile, '手機看底部那條')
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主要頁面' })
    await expect(nav.getByRole('link')).toHaveText(['排行程', '方法', 'AI 助理', '關於'])
    await nav.getByRole('link', { name: '方法' }).click()
    await expect(page).toHaveURL(/\/method$/)
    await expect(nav.getByRole('link', { name: '方法' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('link', { name: /幕後/ })).toHaveCount(0)
  })
  test('手機：底部四顆都看得到、不換行', async ({ page, isMobile }) => {
    test.skip(!isMobile, '只在手機專案跑')
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主要頁面（底部）' })
    const links = nav.getByRole('link')
    await expect(links).toHaveCount(4)
    const tops = await links.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
  })
  test('頁尾有三頁的連結', async ({ page }) => {
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    for (const name of ['方法', '在 AI 助理裡使用', '關於']) await expect(footer.getByRole('link', { name })).toBeVisible()
  })
})
```

- [ ] **Step 6：全套檢查、Commit**

```bash
cd frontend && npm run predemo
git add src/app/navItems.ts src/app/navItems.test.ts src/app/BottomNav.tsx src/app/AppShell.tsx src/app/SiteFooter.tsx src/app/router.tsx src/features/method/MethodPage.tsx src/features/ai/AiPage.tsx src/features/about/AboutPage.tsx e2e/info.e2e.ts
git commit -m "feat(frontend): 導覽列四顆（排行程、方法、AI 助理、關於），頁尾加連結，三頁的路由骨架

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2：方法頁的真數字 `methodFacts`

**Files:**
- Create：`frontend/src/features/method/methodFacts.ts`、`frontend/src/features/method/methodFacts.test.ts`

**Interfaces:**
- Consumes：`PlanResult`、`Plan`（`@/api/schemas`）；`stepSpans`／`bufferOf`（`@/shared/lib/steps`，只在需要時；本任務直接讀 `plan.timeline` 就夠）。
- Produces：

```ts
export type MethodFacts = {
  combinations: number
  feasible: number
  plans: number
  /** 第 1 個方案每道關卡的真數字；null＝這個方案沒有那一關的數字 */
  showtimeBuffer: number | null   // 走到影城後離開演還有幾分
  lastOrderBuffer: number | null  // 到餐廳後離最後點餐還有幾分
  walkMinutes: number | null      // 影城和餐廳之間走幾分
  returnBuffer: number | null     // 走到車站後離預定那班車還有幾分
  homeBuffer: number | null       // 到家時離最晚到家時間還有幾分
  costTotal: number               // 每人總花費
  costParts: { ticket: number; meal: number; fares: number }
  minBuffer: number               // 整趟最緊的一段
}
export function methodFacts(result: PlanResult): MethodFacts
```

- [ ] **Step 1：先寫測試**（數字是 `backend-plan-result.json` 第 1 個方案的真值）

```ts
import { describe, expect, it } from 'vitest'
import fixture from '@/api/__fixtures__/backend-plan-result.json'
import { PlanResult } from '@/api/schemas'
import { methodFacts } from './methodFacts'

const result = PlanResult.parse(fixture)

describe('方法頁的真數字（規格 4.5）', () => {
  const f = methodFacts(result)
  it('三層：全部組合、每段接得上、給你的方案', () => {
    expect([f.combinations, f.feasible, f.plans]).toEqual([73038, 1201, 3])
  })
  it('每一關的真數字（第 1 個方案）', () => {
    expect(f.showtimeBuffer).toBe(12)
    expect(f.lastOrderBuffer).toBe(5)
    expect(f.walkMinutes).toBe(2)
    expect(f.returnBuffer).toBe(54)
    expect(f.homeBuffer).toBe(55)
    expect(f.costTotal).toBe(510)
    expect(f.costParts).toEqual({ ticket: 330, meal: 150, fares: 30 })
    expect(f.minBuffer).toBe(5)
  })
  it('沒有那一關的數字時給 null，不編', () => {
    const plan = { ...result.plans[0], timeline: result.plans[0].timeline.map((s) => ({ ...s, buffer_minutes: null, buffer_gate: null })) }
    const g = methodFacts({ ...result, plans: [plan] })
    expect([g.showtimeBuffer, g.lastOrderBuffer, g.returnBuffer, g.homeBuffer]).toEqual([null, null, null, null])
  })
})
```

（如果 `PlanResult.parse(fixture)` 的欄位名稱跟上面不同，例如 schema 把 `cost_per_person` 轉成別的名字，以 `src/api/schemas.ts` 為準調整，並在報告裡寫出來。）

- [ ] **Step 2：跑測試看它失敗**：`npx vitest run src/features/method` → 找不到模組。

- [ ] **Step 3：實作**

```ts
import type { Plan, PlanResult } from '@/api/schemas'

// MethodFacts 型別照上面 Interfaces

const gateBuffer = (plan: Plan, gate: string) => plan.timeline.find((s) => s.buffer_gate === gate)?.buffer_minutes ?? null

/** 影城走到餐廳那一段：電影後面的第一段走路（先吃飯再看電影時是餐廳後面的第一段） */
function walkBetween(plan: Plan): number | null {
  const t = plan.timeline
  const first = t.findIndex((s) => s.type === 'movie' || s.type === 'meal')
  const walk = first >= 0 ? t.slice(first + 1).find((s) => s.type === 'walk') : undefined
  return walk?.minutes ?? null
}

export function methodFacts(result: PlanResult): MethodFacts {
  const plan = result.plans[0]
  const c = plan.cost_per_person
  return {
    combinations: result.stats.combinations,
    feasible: result.stats.feasible,
    plans: result.plans.length,
    showtimeBuffer: gateBuffer(plan, 'showtime'),
    lastOrderBuffer: gateBuffer(plan, 'last_order'),
    walkMinutes: walkBetween(plan),
    returnBuffer: gateBuffer(plan, 'return_trip'),
    homeBuffer: gateBuffer(plan, 'latest_return'),
    costTotal: c.total,
    costParts: { ticket: c.ticket, meal: c.meal, fares: c.fare_go + c.fare_return },
    minBuffer: plan.min_buffer_minutes,
  }
}
```

- [ ] **Step 4：跑測試看它通過**，再 `npm run predemo`。

- [ ] **Step 5：Commit**

```bash
git add src/features/method/methodFacts.ts src/features/method/methodFacts.test.ts
git commit -m "feat(frontend): 方法頁的真數字（真後端範例第 1 個方案的每道關卡）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3：方法頁 `/method`：捲動解說

**Files:**
- Create：`frontend/src/features/method/MethodStep.tsx`
- Modify：`frontend/src/features/method/MethodPage.tsx`（Task 1 的骨架）、`frontend/e2e/info.e2e.ts`

**Interfaces:**
- Consumes：`methodFacts(result)`（Task 2）、`PlanResult.parse(fixture)`；`BUFFER_LEVELS`（`@/shared/lib/config`：寬鬆 ≥ 30、剛好 ≥ 10）；`useStatus`（`@/api/queries`）＋`latestUpdate`（`@/app/latestUpdate`）；`usePageTitle`。
- Produces：`MethodStep({ n, title, fact, children })`；頁面上每一段一個 `<section aria-labelledby>`，標題是 `h2`。

**畫面（由上往下，每一段一個 `MethodStep`，一段約一個手機畫面高 `min-h-[70vh]`）：**

| # | 標題（h2） | 真數字（大字，`zg-num`） | 說明（白話，一兩句） |
|---|---|---|---|
| 0 | 先把所有可能都列出來 | `73,038` 種組合 | 那天每一場電影 × 每一家餐廳 × 去回的每一班車，先全部列出來，再一關一關刪。 |
| 1 | 第一關：趕得上開演 | 開演前還有 `12` 分 | 從出發點搭車、走到影城，要在開演前到。這個例子走到影城時，離開演還有 12 分鐘。 |
| 2 | 第二關：趕得上點餐 | 離最後點餐還有 `5` 分 | 散場後走到餐廳，要在最後點餐時間之前（先吃飯再看電影時，吃完也要趕得上開演）。 |
| 3 | 第三關：走路不超過上限 | 影城到餐廳走 `2` 分 | 影城和餐廳之間的走路時間，不能超過你設定的上限。 |
| 4 | 第四關：趕得上回程車 | 離預定那班車還有 `54` 分；到家前還有 `55` 分 | 最後要趕得上回程的車，並且在你說的時間前回到出發點。 |
| 5 | 第五關：不超過預算 | 每人 `$510`（電影 330、餐點 150、車資 30） | 車資、電影票和一餐加起來，不超過你給的每人預算。 |
| 6 | 五關都過的才留下 | `1,201` 種每段都接得上 → 挑出 `3` 個 | 每一道關卡都只刪掉接不上的組合，所以留下來的每一個都保證接得上。我們不列每一關各刪了幾組，因為系統只記錄最後的結果。 |
| 7 | 緩衝怎麼算 | 這個例子最緊的一段 `5` 分 | 緩衝＝你到的時間和「最晚可以到」之間差幾分鐘。30 分以上算寬鬆、10～29 分算剛好、10 分以下算偏緊（數字來自 `BUFFER_LEVELS`，不要寫死）。 |
| 8 | 為什麼要查最早到、最晚走的車 | （無數字，畫一條時間線示意：出門 → 最早到的那班 → 開演；散場 → 最晚走的那班 → 到家） | 去程只要最早到的那班趕得上就好；回程要知道最晚哪一班還回得去，才知道能玩多久。班次每次排行程時都即時查交通部的資料，不是用舊時刻表。 |
| 9 | 資料從哪來、多久更新 | 頁尾同一個「資料更新」時間（`useStatus` 的 `data_updated_at` 取最新）；拿不到就不顯示數字 | 電影場次：開眼電影網，每天更新；餐廳：OpenStreetMap 和 Google 地圖；車站和班次：交通部 TDX，班次每次即時查。 |

- 數字都從 `methodFacts(PlanResult.parse(fixture))` 來，用 `toLocaleString()` 加千分位；大字旁邊小字標「示範：一次真的規劃結果」。第 7 段的門檻從 `BUFFER_LEVELS` 讀。
- 頁首（`h1` 下面一段）：「每一個方案都要通過五道關卡。下面用一次真的規劃當例子，往下捲一關一關看。」
- 頁尾一個按鈕「用你的條件排一次」→ `/plan/1`。
- **動態**：`MethodStep` 用 Motion 的 `motion.section` ＋ `initial={{ opacity: 0, y: 24 }}`、`whileInView={{ opacity: 1, y: 0 }}`、`viewport={{ once: true, amount: 0.3 }}`；`useReducedMotion()` 為真時 `initial={false}`（直接顯示最後一格）。數字不做跳動動畫（文字一出現就是最後的值）。第 8 段的時間線是靜態 SVG（`aria-hidden`，旁邊已經有文字說明）。
- 進度提示：電腦版左邊一條細的 `ol`（`aria-label="這一頁的段落"`，`lg:sticky`），列 0～9 的短標題，連到各段 `#method-0`…；手機不顯示。
- 用字：不出現 AI、Jev、LLM、機率。

- [ ] **Step 1：`MethodStep.tsx`**

```tsx
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

export function MethodStep({ n, title, fact, children }: { n: number; title: string; fact?: ReactNode; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      id={`method-${n}`}
      aria-labelledby={`method-${n}-title`}
      className="flex min-h-[70vh] scroll-mt-20 flex-col justify-center py-12"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <h2 id={`method-${n}-title`} className="text-2xl font-bold sm:text-3xl">{title}</h2>
      {fact && <div className="mt-4 text-4xl font-semibold text-primary sm:text-5xl">{fact}</div>}
      <div className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground">{children}</div>
    </motion.section>
  )
}
```

- [ ] **Step 2：`MethodPage.tsx`** 照上表把 10 段排出來（資料在檔案上方算一次：`const facts = methodFacts(PlanResult.parse(fixture))`；這個頁面是延遲載入，fixture 進的是方法頁自己的包，不影響首頁）。

- [ ] **Step 3：流程測試**（加到 `e2e/info.e2e.ts`）

```ts
test.describe('方法頁', () => {
  test('往下捲，十段都看得到，數字是真後端範例', async ({ page }) => {
    await page.goto('/method')
    await expect(page.getByRole('heading', { level: 1, name: '我們怎麼確定每一段都接得上' })).toBeVisible()
    const titles = page.getByRole('heading', { level: 2 })
    await expect(titles).toHaveCount(10)
    for (let i = 0; i < 10; i++) {
      await titles.nth(i).scrollIntoViewIfNeeded()
      await expect(titles.nth(i)).toBeVisible()
    }
    await expect(page.getByText('73,038')).toBeVisible()
    await expect(page.getByText('1,201')).toBeVisible()
  })
  test('減少動態：一打開每一段都已經是最後一格', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/method')
    const last = page.locator('#method-9')
    await last.scrollIntoViewIfNeeded()
    await expect(last).toHaveCSS('opacity', '1')
  })
  test('不出現 AI、Jev、LLM、機率', async ({ page }) => {
    await page.goto('/method')
    const text = await page.locator('main').innerText()
    expect(text).not.toMatch(/\bAI\b|Jev|LLM|機率/)
  })
})
```

- [ ] **Step 4：全套檢查、Commit**

```bash
cd frontend && npm run predemo
git add src/features/method/MethodPage.tsx src/features/method/MethodStep.tsx e2e/info.e2e.ts
git commit -m "feat(frontend): 方法頁：往下捲一關一關看，每一關配一個真數字

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4：AI 助理頁 `/ai`

**Files:**
- Create：`frontend/src/features/ai/mcpUrl.ts`、`frontend/src/features/ai/mcpUrl.test.ts`
- Modify：`frontend/src/features/ai/AiPage.tsx`（Task 1 的骨架）、`frontend/.env.example`、`frontend/src/vite-env.d.ts`（如果環境變數有型別宣告就加 `VITE_PUBLIC_MCP_URL`）、`frontend/e2e/info.e2e.ts`

**Interfaces:**
- Consumes：`USE_MOCK`（`@/api/client`）、`useDemoStore`（`@/store/demoStore`）、`writeClipboard(text): Promise<boolean>`（`@/shared/lib/clipboard`）。
- Produces：

```ts
/** MCP 網址從哪來：明確設定 > 後端網址 + /mcp > 同網域 /mcp；假資料模式沒設定時回 null（展示站沒有後端） */
export function mcpUrl(env: { publicMcpUrl?: string; apiBase?: string; useMock: boolean }, origin: string): string | null
export function claudeCodeCommand(url: string): string   // `claude mcp add --transport http zerogap ${url}`
```

- [ ] **Step 1：先寫測試** `mcpUrl.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { claudeCodeCommand, mcpUrl } from './mcpUrl'

const origin = 'https://zerogap.example.tw'
describe('MCP 網址', () => {
  it('有明確設定就用它', () => expect(mcpUrl({ publicMcpUrl: 'https://api.zerogap.tw/mcp', useMock: true }, origin)).toBe('https://api.zerogap.tw/mcp'))
  it('有後端網址就接 /mcp，不會多一條斜線', () => {
    expect(mcpUrl({ apiBase: 'https://api.zerogap.tw', useMock: false }, origin)).toBe('https://api.zerogap.tw/mcp')
    expect(mcpUrl({ apiBase: 'https://api.zerogap.tw/', useMock: false }, origin)).toBe('https://api.zerogap.tw/mcp')
  })
  it('真後端、同網域：用目前網址的 origin', () => expect(mcpUrl({ apiBase: '', useMock: false }, origin)).toBe('https://zerogap.example.tw/mcp'))
  it('假資料模式又沒設定：沒有後端可以接', () => expect(mcpUrl({ useMock: true }, origin)).toBeNull())
  it('Claude Code 的指令', () => expect(claudeCodeCommand('https://api.zerogap.tw/mcp')).toBe('claude mcp add --transport http zerogap https://api.zerogap.tw/mcp'))
})
```

- [ ] **Step 2：跑測試看它失敗**。
- [ ] **Step 3：實作 `mcpUrl.ts`**

```ts
export function mcpUrl(env: { publicMcpUrl?: string; apiBase?: string; useMock: boolean }, origin: string): string | null {
  if (env.publicMcpUrl) return env.publicMcpUrl
  if (env.useMock) return null
  const base = (env.apiBase || origin).replace(/\/+$/, '')
  return `${base}/mcp`
}

export const claudeCodeCommand = (url: string) => `claude mcp add --transport http zerogap ${url}`
```

頁面裡這樣呼叫：`mcpUrl({ publicMcpUrl: import.meta.env.VITE_PUBLIC_MCP_URL, apiBase: import.meta.env.VITE_API_BASE, useMock: USE_MOCK || demo }, window.location.origin)`。`.env.example` 加：

```
# 「在 AI 助理裡使用」頁顯示的 MCP 網址；留空時用 VITE_API_BASE + /mcp（假資料模式留空＝頁面說明展示站沒有接後端）
VITE_PUBLIC_MCP_URL=
```

- [ ] **Step 4：`AiPage.tsx` 的內容**（由上往下；文案照寫，不出現 Jev、LLM、機率）

1. `h1`「在 AI 助理裡使用 ZeroGap」＋一段：「如果你平常用支援 MCP 的 AI 助理（例如 Claude），可以把 ZeroGap 接進去，直接用說的排行程。助理排好會給你一個連結，打開就是網站上同一份行程，可以看錶盤、地圖、加到行事曆。」
2. **可以這樣說**（`h2`），三張卡，每張一句範例和一個「複製」按鈕：
   - 「週六晚上從中壢站出發，去中壢看電影吃日式，每人 800 以內，11 點前回到家。」
   - 「明天下午兩點後從桃園站出發，先吃飯再看電影，走路不要超過 8 分鐘。」
   - 「這週五晚上想在桃園區看 IMAX，有哪些片？」
3. **怎麼接上**（`h2`）：
   - 網址卡：`mcpUrl(...)` 有值時顯示網址（`zg-num`、可選取）＋「複製網址」；為 `null` 時顯示：「這個展示站用的是示範資料，沒有接上真的後端，所以還不能從 AI 助理連進來。團隊把後端架起來以後，這裡會顯示網址。」（不顯示假網址）
   - 「Claude 桌面版或網頁版」：到設定的「連接器」新增自訂連接器，名稱填 ZeroGap，網址貼上上面那個。（只寫步驟，不放截圖）
   - 「Claude Code」：一行指令 `claudeCodeCommand(url)`＋「複製指令」；網址為 `null` 時這張卡不顯示。
   - 「其他支援 MCP 的助理」：選「HTTP」或「Streamable HTTP」連線方式，貼上同一個網址，不需要金鑰。
4. **助理會用到的工具**（`h2`）：`<dl>`，名稱用 `code`，說明白話：
   - `list_areas`：有哪些商圈可以排（目前只有桃園市）。
   - `search_locations`：把地址或地標換成出發位置。
   - `list_stations`：某個縣市有哪些車站。
   - `list_categories`：電影片型、料理類別的代碼。
   - `data_coverage`：某個商圈某一天有哪些電影、影廳、語言和可以吃的料理。
   - `plan_date`：真的排出行程（約 1～3 分鐘，過程中會回報進度），回傳最多 3 個方案和網站連結。
5. **做不到的事**（`h2`）：只有桃園市的商圈；不能訂票、不能只找餐廳不看電影；同一個網路每小時能排的次數有限，太多人同時排會排隊；資料是學術展示用。
- 「複製」按鈕用 `writeClipboard`，成功時按鈕文字變「已複製」2 秒（`setTimeout` 在卸載時清掉），失敗時在旁邊顯示「請手動選取複製」。

- [ ] **Step 5：流程測試**（加到 `e2e/info.e2e.ts`）

```ts
test.describe('AI 助理頁', () => {
  test('六個工具都列出來；展示站（假資料）照實說還不能連', async ({ page }) => {
    await page.goto('/ai')
    for (const t of ['list_areas', 'search_locations', 'list_stations', 'list_categories', 'data_coverage', 'plan_date']) {
      await expect(page.getByText(t, { exact: true })).toBeVisible()
    }
    await expect(page.getByText(/沒有接上真的後端/)).toBeVisible()
    await expect(page.getByText(/claude mcp add/)).toHaveCount(0)
  })
  test('範例句子可以複製', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', '只有 Chromium 能在測試裡給剪貼簿權限')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/ai')
    await page.getByRole('button', { name: /複製/ }).first().click()
    await expect(page.getByRole('button', { name: /已複製/ })).toBeVisible()
  })
  test('不出現 Jev、LLM、機率', async ({ page }) => {
    await page.goto('/ai')
    expect(await page.locator('main').innerText()).not.toMatch(/Jev|LLM|機率/)
  })
})
```

- [ ] **Step 6：全套檢查、Commit**

```bash
cd frontend && npm run predemo
git add src/features/ai/mcpUrl.ts src/features/ai/mcpUrl.test.ts src/features/ai/AiPage.tsx .env.example e2e/info.e2e.ts
# 有改 src/vite-env.d.ts 的話也 add
git commit -m "feat(frontend): 在 AI 助理裡使用：範例說法、怎麼接上（MCP 網址、Claude 指令）、六個工具、做不到的事

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5：關於頁 `/about`

**Files:**
- Create：`frontend/src/features/about/storageKeys.ts`、`frontend/src/features/about/storageKeys.test.ts`
- Modify：`frontend/src/features/about/AboutPage.tsx`（Task 1 的骨架）、`frontend/e2e/info.e2e.ts`

**Interfaces:**
- Produces：`STORAGE_KEYS: { key: string; what: string; keep: string }[]`（這個網站在瀏覽器存的每一樣東西）。

- [ ] **Step 1：先寫測試**：清單要跟程式真的用到的 localStorage 名稱一致（新加一個存的東西、忘了寫進關於頁，測試就會失敗）

```ts
import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from './storageKeys'

// 掃 src 底下所有程式（不含測試）裡出現的 'zg-…' 儲存名稱
const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const used = new Set<string>()
for (const code of Object.values(sources)) for (const m of code.matchAll(/(?:name:\s*|_KEY\s*=\s*)'(zg-[a-z-]+)'/g)) used.add(m[1])

describe('關於頁列出的瀏覽器儲存', () => {
  it('跟程式裡真的用到的一致', () => {
    expect(new Set(STORAGE_KEYS.map((k) => k.key))).toEqual(used)
  })
  it('每一項都有白話說明和保留多久', () => {
    for (const k of STORAGE_KEYS) {
      expect(k.what.length).toBeGreaterThan(4)
      expect(k.keep.length).toBeGreaterThan(1)
    }
  })
})
```

- [ ] **Step 2：跑測試看它失敗**。
- [ ] **Step 3：`storageKeys.ts`**（目前程式裡用到的 6 個；如果掃出來的跟這裡不同，以掃出來的為準補齊，並在報告寫出來）

```ts
/** 這個網站存在你瀏覽器裡的東西（關於頁的「隱私」段落用）。新增 localStorage 時一定要加在這裡，測試會檢查 */
export const STORAGE_KEYS: { key: string; what: string; keep: string }[] = [
  { key: 'zg-plan', what: '你上次填的條件（出發點、日期、預算等），下次打開不用重填', keep: '直到你清除瀏覽器資料' },
  { key: 'zg-plan-runs', what: '這台瀏覽器排過的行程結果，重新整理或回到分享頁時不用重排', keep: '直到你清除瀏覽器資料' },
  { key: 'zg-theme', what: '你選的外觀（日、夜、跟著手機）', keep: '直到你清除瀏覽器資料' },
  { key: 'zg-demo', what: '展示模式有沒有打開', keep: '直到你清除瀏覽器資料' },
  { key: 'zg-route-cache', what: '地圖查過的走路路線和餐廳位置，同一份行程不重複查', keep: '7 天' },
  { key: 'zg-mock-saved', what: '展示站（示範資料）排好的行程，讓分享頁在同一台瀏覽器打得開', keep: '7 天' },
]
```

- [ ] **Step 4：`AboutPage.tsx` 的內容**（不出現 AI、Jev、LLM、機率）

1. `h1`「關於 ZeroGap」＋「ZeroGap 零空檔幫你排好『看電影＋吃飯＋搭車』的一個晚上，保證每一段的時間都接得上：趕得上開演、趕得上點餐、趕得上回家的車。」
2. **誰做的**（`h2`）：「資策會 AIAE1 第一組的專題作品。」＋「成員和每個人的貢獻」連到 `https://github.com/RyanWu9863/ZeroGap/graphs/contributors`（`target="_blank" rel="noreferrer"`）＋原始碼連到 `https://github.com/RyanWu9863/ZeroGap`。**不寫任何人名和 email。**
3. **資料來源和授權**（`h2`）：表格（`overflow-x-auto` 包起來），欄：資料、來源、授權或使用方式。
   - 車站、公車和火車班次｜交通部 TDX 運輸資料流通服務｜政府資料開放授權條款第 1 版；班次每次排行程時即時查詢。
   - 電影場次｜開眼電影網｜僅供學術展示，場次以影城公告為準。
   - 餐廳（一部分）｜OpenStreetMap｜© OpenStreetMap 貢獻者，ODbL 授權。
   - 餐廳（一部分）、地圖｜Google 地圖、Google Places｜依 Google 地圖服務條款使用，畫面上會標示來源；不保存 Google 的座標。
   - 表格下面一句：「時間和價格以現場為準；這是學術展示用的作品，不保證資料即時正確。」
4. **隱私**（`h2`）：
   - 「不用註冊、沒有帳號，也沒有追蹤你的廣告或分析程式。」
   - 「分享連結：排好的行程會在伺服器上保存 7 天，知道連結的人都打得開。如果是從『目前位置』出發，連結裡的行程含有你出發的大概位置（約 100 公尺內）。」
   - 「這個網站在你的瀏覽器存了這些東西：」＋把 `STORAGE_KEYS` 畫成清單（名稱用 `code`、白話說明、保留多久）＋「清除這個網站的瀏覽器資料就會全部刪掉。」
5. **有問題或建議**（`h2`）：到 GitHub 開 issue（連到 `https://github.com/RyanWu9863/ZeroGap/issues`）。

- [ ] **Step 5：流程測試**（加到 `e2e/info.e2e.ts`）

```ts
test.describe('關於頁', () => {
  test('資料來源四項、隱私清單、成員連到 GitHub', async ({ page }) => {
    await page.goto('/about')
    for (const s of ['交通部 TDX', '開眼電影網', 'OpenStreetMap', 'Google']) await expect(page.getByRole('table').getByText(s).first()).toBeVisible()
    await expect(page.getByText('zg-plan-runs')).toBeVisible()
    await expect(page.getByRole('link', { name: /成員/ })).toHaveAttribute('href', 'https://github.com/RyanWu9863/ZeroGap/graphs/contributors')
    expect(await page.locator('main').innerText()).not.toMatch(/@|\bAI\b|Jev|LLM|機率/)
  })
})
```

- [ ] **Step 6：全套檢查、Commit**

```bash
cd frontend && npm run predemo
git add src/features/about/storageKeys.ts src/features/about/storageKeys.test.ts src/features/about/AboutPage.tsx e2e/info.e2e.ts
git commit -m "feat(frontend): 關於頁：誰做的、資料來源和授權、隱私（瀏覽器存了什麼，測試保證清單完整）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6：幕後頁 `/behind` 用夜主題重畫

**Files:**
- Create：`frontend/src/features/behind/McpSection.tsx`、`frontend/src/features/behind/behindExample.ts`＋`.test.ts`
- Modify：`frontend/src/features/behind/BehindPage.tsx`、`MethodSection.tsx`、`AgentSection.tsx`、`SourcesSection.tsx`、`FunnelCharts.tsx`（只在需要配合夜主題時改顏色來源）、`frontend/src/app/AppShell.tsx`（展示模式橫條加連結）、`frontend/e2e/a11y.e2e.ts`（幕後頁的就緒條件如果改了標題要跟著改）、`frontend/e2e/info.e2e.ts`

**Interfaces:**
- Consumes：`useLastResult()`（`@/api/planRuns`，回傳 `{ request, result } | null`，讀現有程式確認形狀）、`PlanResult.parse(fixture)`、`funnelStages(result)`（`@/shared/lib/funnel`）、`useDemoStore`。
- Produces：`behindExample(): { request: null; result: PlanResult; origin: string | null; sample: true }`（示範範例：真後端結果；**沒有當時送出的條件**）、`McpSection`；`AgentSection` 的 `request` 改成 `PlanRequest | null`。

- [ ] **Step 1：示範範例改用真後端結果**（先寫測試）

`backend-plan-result.json` 是真後端跑出來的結果，但**沒有保存當時送出的條件**（repo 和歷史裡都找不到）。不要編一份條件：`request` 給 `null`；標題用結果裡看得到的資訊（第 1 個方案第一段搭車的 `from`，例如「中壢」）寫「示範：一次真的規劃結果（從中壢出發）」；原始 JSON 那段只顯示結果，條件那格寫「示範範例沒有保存當時送出的條件」。測試：

```ts
import { describe, expect, it } from 'vitest'
import { behindExample } from './behindExample'

describe('幕後頁的示範範例', () => {
  it('用真後端跑出來的結果，數字跟首頁示範一致；不編條件', () => {
    const ex = behindExample()
    expect(ex.sample).toBe(true)
    expect(ex.request).toBeNull()
    expect(ex.result.stats).toEqual({ combinations: 73038, feasible: 1201 })
    expect(ex.result.plans).toHaveLength(3)
    expect(ex.origin).toBe('中壢')
  })
})
```

`BehindPage` 用 `const last = useLastResult()`（回傳 `{ request, result } | null`）；有就用 `last`，沒有就用 `behindExample()`。用到 `request` 的地方（`useRequestLabels`、`AgentSection`）都要處理 `null`。

- [ ] **Step 2：夜主題**：`BehindPage` 最外層：

```tsx
<div data-theme="night" className="dark min-h-screen bg-background text-foreground">…</div>
```

（`index.css` 的夜色變數掛在 `[data-theme="night"]`，`dark:` 變體是 `.dark *`，兩個都設，這一塊就一定是夜；頁面其他部分和導覽列照使用者自己的外觀。）`useEffect` 在進頁面時加 `<meta name="robots" content="noindex">`、離開時拿掉。

- [ ] **Step 3：段落（由上往下）**

1. **方法＋架構**（沿用 `MethodSection`）：管線改成「你的條件 → SQL 粗篩候選 → 五道關卡（Python）→ Jev 排序（最高機率低於 0.60 時 LLM 代選）→ TDX 查精確班次 → 三個方案＋分享連結」。
2. **這次的漏斗**（沿用 `FunnelCharts`，Recharts 延遲載入：`const FunnelCharts = lazy(...)`，`Suspense` 時先顯示三個數字的文字版）。標題「從全部組合到 N 個方案」保留（a11y 測試靠它）。示範範例時標「示範：一次真的規劃結果」，不是「假資料」。
3. **決策表**（沿用 `ProbabilityTable`）。
4. **MCP：同一份行程，AI 助理也拿得到**（新的 `McpSection`）：
   - 六個工具的表（名稱、做什麼、什麼時候用），內容同 Task 4 的工具說明，可以直接講 Jev、LLM。
   - 一次呼叫的流程（`ol`，每一步一行）：①助理呼叫 `list_areas` 找商圈 code → ②`data_coverage` 查那天有什麼 → ③`plan_date` 送出條件 → ④後端照網頁同一條路排程，進度用 MCP 的進度通知回報（排隊、階段）→ ⑤回傳最多 3 個方案和 `share_url` → ⑥使用者點連結，網站的 `/p/編號` 打開同一份行程。
   - 一行說明：「網頁和 MCP 共用同一個服務函式（`plan_stream`）、同樣的限流和排隊上限。」
5. **資料來源狀態＋展示模式**（沿用 `SourcesSection`）。展示模式的開關**就在這頁**：保持現有的 checkbox，標題改「展示模式（Demo 現場的保險）」。
6. **原始 JSON**（沿用 `AgentSection` 的 `<details>`，拿掉跟第 4 段重複的 MCP 說明）。

- [ ] **Step 4：展示模式橫條**（`AppShell.tsx`）：頂端「展示模式：使用預先錄製的回應，不是即時查詢」後面加一個連結「到幕後頁關掉」→ `/behind#demo`，`SourcesSection` 的展示模式卡加 `id="demo"`。

- [ ] **Step 5：流程測試**（加到 `e2e/info.e2e.ts`）

```ts
test.describe('幕後頁', () => {
  test('不管外觀選什麼，幕後都是夜；有 MCP 流程和六個工具；示範範例標示範', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/behind')
    await expect(page.locator('[data-theme="night"]').first()).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day')
    await expect(page.getByRole('heading', { name: /^從全部組合到/ })).toBeVisible()
    await expect(page.getByText('73,038').first()).toBeVisible()
    await expect(page.getByText('plan_date').first()).toBeVisible()
    await expect(page.getByText('share_url').first()).toBeVisible()
  })
  test('展示模式：在幕後打開，每一頁頂端都有標籤和「到幕後頁關掉」', async ({ page }) => {
    await page.goto('/behind')
    await page.getByLabel('打開展示模式').check()
    await page.goto('/method')
    await expect(page.getByText(/展示模式：使用預先錄製的回應/)).toBeVisible()
    await page.getByRole('link', { name: '到幕後頁關掉' }).click()
    await expect(page).toHaveURL(/\/behind#demo$/)
    await page.getByLabel('打開展示模式').uncheck()
    await expect(page.getByText(/展示模式：使用預先錄製的回應/)).toHaveCount(0)
  })
})
```

- [ ] **Step 6：全套檢查、Commit**

```bash
cd frontend && npm run predemo
git add src/features/behind/ src/app/AppShell.tsx e2e/info.e2e.ts e2e/a11y.e2e.ts
git commit -m "feat(frontend): 幕後頁用夜主題重畫：MCP 工具和一次呼叫的流程，示範範例改用真後端結果，展示模式橫條可以直接連過來關

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

（`git add src/features/behind/` 之前先 `git status` 確認那個資料夾裡只有自己改的檔案。）

---

### Task 7：首頁「排行程」在負載下偶爾沒反應

**背景：** 第 4 批全套 `npm run predemo` 時，iPad 專案的 `result.e2e.ts`「排好後網址換成 /p/編號」失敗一次：在首頁按「排行程」後 30 秒網址還是 `/`。單獨重跑 125 次全過。`QuickPlanForm.tsx` 有「清單或場次日期還在載入、日期還沒自動換好時先按了『排行程』：記著，載入好再送」的邏輯（約第 115 行），懷疑是在某個時序下記住的點擊沒有送出。

**Files:**
- Modify：`frontend/src/features/home/QuickPlanForm.tsx`（和找到原因需要動的檔案）、`frontend/e2e/home.e2e.ts`

- [ ] **Step 1：重現**：用 REQUIRED SUB-SKILL systematic-debugging。在負載下重跑：`npx playwright test e2e/result.e2e.ts e2e/home.e2e.ts --project=ipad --repeat-each=10 --workers=8`，失敗時看 trace（`npx playwright show-trace` 不能開視窗的話，用 `unzip -p trace.zip` 看 `trace.trace` 裡的事件）。也可以在測試裡用 `page.route('**/api/**', …)` 或假後端的延遲，人為讓清單、場次、日期自動換晚一點回來，找出「按了沒送出」的時序。
- [ ] **Step 2：先寫一個會失敗的流程測試**，重現那個時序（例如：清單載入延遲 2 秒，期間按「排行程」，載入完要自動送出並換到 `/result` → `/p/…`）。
- [ ] **Step 3：修**：記住的點擊在所有等待條件都滿足時一定送出；等待期間按鈕顯示忙碌（`aria-busy="true"`、文字「準備中…」、不能重複按），超過 10 秒還沒準備好就顯示白話錯誤和「再試一次」。
- [ ] **Step 4：驗證**：Step 1 的負載指令連跑兩次全過；`npm run predemo` 全過。
- [ ] **Step 5：Commit**（訊息照實寫找到的原因）

```bash
git add src/features/home/QuickPlanForm.tsx e2e/home.e2e.ts
git commit -m "fix(home): 「排行程」在清單還沒載入好時按下去，載入好一定會送出；等待時按鈕顯示準備中

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

如果在 Step 1 做足重現仍然找不到原因：不要猜著改，Step 3 只做忙碌狀態和逾時說明，報告寫清楚試過的時序和結果，狀態回 DONE_WITH_CONCERNS。

---

### Task 8：收尾：無障礙、效能、文件

**Files:**
- Modify：`frontend/e2e/a11y.e2e.ts`、`frontend/README.md`、`docs/superpowers/specs/2026-11-07-frontend-redesign-design.md`（第 9 節「暫留」那一列改成已換新；第 11 節第 5 批標 ✅）、這份計畫的進度表
- Create：`frontend/docs/導讀_12_方法AI關於幕後.md`

- [ ] **Step 1：axe**：`a11y.e2e.ts` 的頁面清單加 `/method`（等 `h1`）、`/ai`（等 `h1`）、`/about`（等 `h1`）；日、夜兩套都掃（照檔案裡現有的寫法）。`/behind` 已經在清單裡，確認它在「日」的那一輪也過（頁面本身是夜）。零嚴重問題；有的話修掉並在報告寫出來。方法頁掃描前先 `emulateMedia({ reducedMotion: 'reduce' })`，確保每一段都已經顯示。
- [ ] **Step 2：效能**：`npm run perf`，首頁慢速 4G LCP 仍 < 2.0 秒；數字寫進導讀。確認 `dist/` 裡首頁的包沒有 `backend-plan-result`、`recharts`（`grep -l` 打包後的檔案）。
- [ ] **Step 3：`導讀_12_方法AI關於幕後.md`**（白話，給組員看）：
  - 導覽四顆、頁尾連結；幕後頁不在導覽裡，網址 `/behind`，上台用。
  - 方法頁：十段在講什麼、數字從哪來（真後端範例第 1 個方案）、為什麼不列每一關刪幾組。
  - AI 助理頁：MCP 網址怎麼決定（`VITE_PUBLIC_MCP_URL` → `VITE_API_BASE` + `/mcp` → 同網域；展示站顯示「沒有接上真的後端」）；Claude 桌面版／網頁版、Claude Code 怎麼接；後端要對外上線才接得到（D12 不在這次範圍）。
  - 關於頁：資料來源和授權、隱私清單；**新增 localStorage 時要加進 `storageKeys.ts`，不然測試會失敗**。
  - 幕後頁：夜主題怎麼做（`data-theme="night"`＋`dark`）、六段內容、展示模式開關在這頁、每一頁的橫條可以直接連過來關。
  - 「排行程」偶爾沒反應：找到的原因和修法（照 Task 7 的報告寫）。
  - 測試數字（單元、流程、LCP）。
- [ ] **Step 4：README**：頁面清單加 `/method`、`/ai`、`/about`，`/behind` 寫「不在導覽列」；環境變數表加 `VITE_PUBLIC_MCP_URL`。
- [ ] **Step 5：全套檢查、Commit**

```bash
cd frontend && npm run predemo && npm run perf
git add e2e/a11y.e2e.ts README.md "docs/導讀_12_方法AI關於幕後.md" ../docs/superpowers/specs/2026-11-07-frontend-redesign-design.md ../docs/superpowers/plans/2026-11-08-frontend-batch5-info-pages.md
git commit -m "docs(frontend): 導讀 12 方法、AI 助理、關於、幕後；四頁的無障礙掃描（日、夜）；規格和 README 更新

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9：推分支、開 PR（不合併）

- [ ] 確認作者 email：`git log feat/result-page..HEAD --format='%ae %ce' | sort -u`，只能是 git 設定裡那個公開的 email；`git log -p feat/result-page..HEAD | grep -c '@gmail'` 要是 0（文件裡不能有個人 email）。
- [ ] 推：`git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin feat/info-pages`（要在 sandbox 外跑）。
- [ ] 開 PR：`gh pr create --repo RyanWu9863/ZeroGap --base feat/result-page --head feat/info-pages`，標題「前端第 5 批：方法、AI 助理、關於、幕後」，說明寫：疊在 #7 上、合併順序 #3 → #6 → #7 → 這個、每頁做了什麼、測試數字、Task 7 找到的原因、合併到 main 會更新展示站。**不合併。**

## 進度表

| Task | 狀態 | Commit |
|---|---|---|
| 1 導覽四顆、路由骨架 | 完成 | `090fa6c` |
| 2 方法頁真數字 | 完成 | `f872ef0` |
| 3 方法頁捲動解說 | 完成 | `60d819a`、`72631a7` |
| 4 AI 助理頁 | 完成 | `522d16f` |
| 5 關於頁 | 完成 | `1d9ebe5`、`3e59e9c` |
| 6 幕後頁重畫 | 完成 | `00fb715` |
| 7 排行程偶爾沒反應 | 完成 | `9415168`、`05da003` |
| 8 收尾 | 完成 | 本 commit（收尾；另有批後清理 `c4872cf`） |
| 9 PR | 待辦 | 待辦 |
