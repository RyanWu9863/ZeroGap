# 前端重新設計 第 3 批「首頁」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首頁改成「點陣剪枝動畫＋大數字＋四格快速條件」，第一次來的人在一個畫面內填完就能排行程；四步精靈變成「更多條件」。

**Architecture:** 新資料夾 `src/features/home/`：三個純函式模組（點陣模型、首頁數字來源、快速條件的日期／檢查）先寫測試；兩個畫面元件（`HomeHero` 標題＋數字＋延遲載入的 Canvas 點陣，`QuickPlan` 四格表單）。`IntroPage` 用新元件取代舊的 `Hero`；舊的範例時間軸、痛點對比、三步驟留在下面不動。

**Tech Stack:** React 19、TypeScript、Tailwind v4、Canvas 2D、Motion（`useReducedMotion`）、Zustand、TanStack Query、Vitest、Playwright。**不加新套件。**

**Spec:** `docs/superpowers/specs/2026-11-07-frontend-redesign-design.md`（3.2 主流程第 1 步、4.2 點陣剪枝、4.6 動態和效能規則）

## Global Constraints

- 工作資料夾 `~/Desktop/JEV/ZeroGap/team-redesign`，分支 `feat/home-quick`，**從 `feat/frontend-foundation`（PR #3）開**；PR 的 base 也是 `feat/frontend-foundation`。
- 首頁快速條件是**四格**：去哪個商圈、從哪出發、哪天、每人預算（2026-11-07 使用者決定；車站沒有座標，前端算不出最近的商圈）。其他條件沿用 `planStore` 目前的值（第一次是基準案例：17:00–23:00、先看電影、走路 12 分…）。
- 首頁數字：這台瀏覽器排過（`zg-plan-runs` 的 `lastDoneKey` 有結果）就用**上次的真數字**；沒排過就用示範數字 **73,038 → 1,201 → 3**（來自 `src/api/__fixtures__/backend-plan-result.json` 的真後端結果），畫面標「示範」。
- 點陣：一點＝一種組合；點太多時抽樣，手機（寬度 < 640px）最多 **4,000** 點、電腦最多 **12,000** 點；畫面照實寫「每點約代表 N 種組合」。只有三層（全部組合 → 每段接得上 → 給你的方案），**不編造五道關卡各自的剔除數**（後端沒給）。
- 每個動畫都有文字版；`prefers-reduced-motion` 時直接畫最後一格。Canvas `aria-hidden`。
- LCP：首頁標題字是最先出現的大元素；點陣元件延遲載入、預留高度不跳版面。`npm run perf` 慢速 4G 首頁 LCP **< 2.0 秒**。
- 顏色只用 `index.css` 的 token（`--zg-flow`、`--zg-glow`、`--muted-foreground`、`--border`），不寫死；夜／日切換時重畫。
- 繁體中文、白話；每個 commit 前 `cd frontend && npm run predemo` 全過；只 add 自己改的檔案、不用 `git add -A`；commit 結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不推送、不開 PR，直到 Task 7；開 PR 後**不合併**。

## 檔案地圖

| 路徑 | 做什麼 |
|---|---|
| `frontend/src/features/home/dotModel.ts`＋`.test.ts` | Task 1：點陣模型（純函式） |
| `frontend/src/features/home/heroStats.ts`＋`.test.ts` | Task 2：首頁數字從哪來（純函式） |
| `frontend/src/features/home/quickPlan.ts`＋`.test.ts` | Task 3：快速條件的日期、缺什麼（純函式） |
| `frontend/src/features/home/DotField.tsx` | Task 4：Canvas 點陣動畫 |
| `frontend/src/features/home/HomeHero.tsx` | Task 4：標題＋數字＋點陣 |
| `frontend/src/features/home/QuickPlanForm.tsx` | Task 5：四格表單＋常見情境（不叫 `QuickPlan.tsx`：會跟 `quickPlan.ts` 在不分大小寫的檔案系統撞名） |
| `frontend/src/features/intro/IntroPage.tsx` | Task 5：換成新元件 |
| `frontend/src/features/intro/Hero.tsx` | Task 5：刪除（情境卡搬進 QuickPlan） |
| `frontend/e2e/home.e2e.ts` | Task 5：首頁流程測試 |
| `frontend/e2e/flows.e2e.ts` | Task 5：舊的「開始規劃」入口改走「更多條件」 |
| `frontend/docs/導讀_10_首頁.md`、`README.md`、規格進度、這份計畫的進度表 | Task 6 |

---

### Task 1：點陣模型 `dotModel.ts`

**Files:**
- Create：`frontend/src/features/home/dotModel.ts`、`frontend/src/features/home/dotModel.test.ts`

**Interfaces:**
- Produces：
  - `type DotStats = { combinations: number; feasible: number; plans: number }`
  - `type DotLayout = { n: number; perDot: number; feasibleDots: number; planDots: number; stage: Uint8Array }`（`stage[i]`：0＝第一關就熄、1＝每段接得上但沒選上、2＝最後給你的方案）
  - `dotCount(width: number, height: number, gap: number, maxDots: number): number`＝`min(floor(width/gap) * floor(height/gap), maxDots)`，最少 0
  - `layoutDots(stats: DotStats, n: number, seed = 7): DotLayout`
  - `MAX_DOTS = { phone: 4000, desktop: 12000 }`、`PHONE_BREAKPOINT = 640`

- [ ] **Step 1：寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest'
import { dotCount, layoutDots, MAX_DOTS } from './dotModel'

const SAMPLE = { combinations: 73038, feasible: 1201, plans: 3 }

describe('dotCount', () => {
  it('照畫布大小算，但不超過上限', () => {
    expect(dotCount(360, 220, 5, MAX_DOTS.phone)).toBe(72 * 44)
    expect(dotCount(1200, 300, 5, MAX_DOTS.phone)).toBe(4000)
  })
  it('畫布太小時是 0', () => expect(dotCount(3, 3, 5, 100)).toBe(0))
})

describe('layoutDots', () => {
  it('組合比點多：每點代表多種組合，照真實比例留點', () => {
    const d = layoutDots(SAMPLE, 4000)
    expect(d.n).toBe(4000)
    expect(d.perDot).toBeCloseTo(73038 / 4000)
    expect(d.feasibleDots).toBe(Math.round((1201 / 73038) * 4000)) // 66
    expect(d.planDots).toBe(3)
    const count = (s: number) => d.stage.filter((x) => x === s).length
    expect(count(2)).toBe(3)
    expect(count(1)).toBe(d.feasibleDots - 3)
    expect(count(0)).toBe(4000 - d.feasibleDots)
  })

  it('真的有接得上的組合時，至少留下方案數那麼多點', () => {
    const d = layoutDots({ combinations: 1_000_000, feasible: 5, plans: 3 }, 1000)
    expect(d.feasibleDots).toBe(3)
    expect(d.planDots).toBe(3)
  })

  it('組合比點少：一點一種，點數就是組合數', () => {
    const d = layoutDots({ combinations: 40, feasible: 10, plans: 3 }, 4000)
    expect(d.n).toBe(40)
    expect(d.perDot).toBe(1)
    expect(d.feasibleDots).toBe(10)
  })

  it('沒有接得上的組合：沒有亮點', () => {
    const d = layoutDots({ combinations: 500, feasible: 0, plans: 0 }, 100)
    expect(d.feasibleDots).toBe(0)
    expect(d.planDots).toBe(0)
    expect(d.stage.every((x) => x === 0)).toBe(true)
  })

  it('同一組資料每次排出來一樣（重畫不換位置）', () => {
    expect(Array.from(layoutDots(SAMPLE, 500).stage)).toEqual(Array.from(layoutDots(SAMPLE, 500).stage))
  })

  it('組合數是 0 或點數是 0：空的', () => {
    expect(layoutDots({ combinations: 0, feasible: 0, plans: 0 }, 100).n).toBe(0)
    expect(layoutDots(SAMPLE, 0).n).toBe(0)
  })
})
```

- [ ] **Step 2：確認失敗** — Run：`cd frontend && npx vitest run src/features/home/dotModel.test.ts` — Expected：FAIL（找不到 `./dotModel`）。

- [ ] **Step 3：實作**

```ts
/*
 * 首頁點陣剪枝的資料模型（規格 4.2）。純函式，方便測試。
 * 一個點＝一種組合；組合太多時抽樣，一點代表 perDot 種。只有三層，因為後端只給這三個數字：
 * 全部組合 → 每段接得上（stats.feasible）→ 給你的方案（plans 數）。不編造五道關卡各自剔除幾組。
 */
export type DotStats = { combinations: number; feasible: number; plans: number }
export type DotLayout = { n: number; perDot: number; feasibleDots: number; planDots: number; stage: Uint8Array }

export const MAX_DOTS = { phone: 4000, desktop: 12000 } as const
export const PHONE_BREAKPOINT = 640

export function dotCount(width: number, height: number, gap: number, maxDots: number): number {
  if (gap <= 0) return 0
  return Math.max(0, Math.min(Math.floor(width / gap) * Math.floor(height / gap), maxDots))
}

/** 固定的「亂數」（線性同餘）：同一組資料每次排出來一樣 */
function shuffled(n: number, seed: number): Uint32Array {
  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  let s = seed >>> 0
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }
  return order
}

export function layoutDots(stats: DotStats, maxN: number, seed = 7): DotLayout {
  const n = Math.max(0, Math.min(maxN, stats.combinations))
  const stage = new Uint8Array(n)
  if (n === 0) return { n: 0, perDot: 0, feasibleDots: 0, planDots: 0, stage }
  const perDot = stats.combinations / n
  const planDots = Math.min(stats.plans, stats.feasible, n)
  // 照比例四捨五入；真的有接得上的組合時，至少留方案數那麼多點
  const feasibleDots = stats.feasible <= 0 ? 0 : Math.min(n, Math.max(planDots, 1, Math.round((stats.feasible / stats.combinations) * n)))
  const order = shuffled(n, seed)
  for (let k = 0; k < feasibleDots; k++) stage[order[k]] = k < planDots ? 2 : 1
  return { n, perDot, feasibleDots, planDots, stage }
}
```

- [ ] **Step 4：確認通過** — 同 Step 2 的指令，Expected：PASS（9 個）。

- [ ] **Step 5：Commit**

```bash
git add frontend/src/features/home/dotModel.ts frontend/src/features/home/dotModel.test.ts
git commit -m "feat(home): 點陣剪枝的資料模型（抽樣、三層、固定亂數）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2：首頁數字從哪來 `heroStats.ts`

**Files:**
- Create：`frontend/src/features/home/heroStats.ts`、`frontend/src/features/home/heroStats.test.ts`

**Interfaces:**
- Consumes：`Run`、`usePlanRunStore`（`@/api/planRuns`；store 形狀 `{ runs: Record<string, Run>; lastDoneKey: string | null }`，`Run.result` 是 `PlanResult | null`，`Run.finishedAt: number | null`）、Task 1 的 `DotStats`。
- Produces：
  - `SAMPLE_STATS: DotStats`＝`{ combinations: 73038, feasible: 1201, plans: 3 }`
  - `type HeroStats = DotStats & { sample: boolean; finishedAt: number | null }`
  - `heroStats(state: { runs: Record<string, Run>; lastDoneKey: string | null }): HeroStats`
  - `useHeroStats(): HeroStats`（`usePlanRunStore(heroStats)`；用 `useShallow` 或選出 `runs`、`lastDoneKey` 兩個值再算，避免每次回傳新物件造成重繪迴圈）

- [ ] **Step 1：寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest'
import fixture from '@/api/__fixtures__/backend-plan-result.json'
import type { Run } from '@/api/planRuns'
import { heroStats, SAMPLE_STATS } from './heroStats'

const done = (combinations: number, feasible: number, plans: number): Run =>
  ({ status: 'done', finishedAt: 1_700_000_000_000, result: { stats: { combinations, feasible }, plans: Array(plans).fill({}) } }) as unknown as Run

describe('heroStats', () => {
  it('示範數字和真後端的範例結果一致（範例檔換了這裡要跟著改）', () => {
    expect(SAMPLE_STATS).toEqual({ combinations: fixture.stats.combinations, feasible: fixture.stats.feasible, plans: fixture.plans.length })
  })
  it('沒排過：用示範數字並標示範', () => {
    expect(heroStats({ runs: {}, lastDoneKey: null })).toEqual({ ...SAMPLE_STATS, sample: true, finishedAt: null })
  })
  it('排過：用上次的真數字', () => {
    expect(heroStats({ runs: { k: done(500, 20, 3) }, lastDoneKey: 'k' })).toEqual({ combinations: 500, feasible: 20, plans: 3, sample: false, finishedAt: 1_700_000_000_000 })
  })
  it('上次那筆不見了或沒有結果：回到示範', () => {
    expect(heroStats({ runs: {}, lastDoneKey: 'gone' }).sample).toBe(true)
    expect(heroStats({ runs: { k: { status: 'failed', result: null } as unknown as Run }, lastDoneKey: 'k' }).sample).toBe(true)
  })
})
```
（如果 `tsconfig` 沒開 `resolveJsonModule`，測試改用 `import fixture from '…json' with { type: 'json' }` 或 `fs.readFileSync` 讀；先看 `src/api/schemas.test.ts` 怎麼讀這個範例檔，照它的寫法。）

- [ ] **Step 2：確認失敗** — `npx vitest run src/features/home/heroStats.test.ts` — Expected：FAIL。

- [ ] **Step 3：實作**

```ts
import { useShallow } from 'zustand/react/shallow'
import { usePlanRunStore, type Run } from '@/api/planRuns'
import type { DotStats } from './dotModel'

/*
 * 首頁大數字從哪來（規格 4.2）：這台瀏覽器排過就用上次的真數字；沒排過用示範數字。
 * 示範數字來自 src/api/__fixtures__/backend-plan-result.json（真後端跑出來的結果）。
 * 不直接 import 那個檔案：它有 30 KB，會拖慢首頁；改成寫死三個數字，測試保證兩邊一致。
 */
export const SAMPLE_STATS: DotStats = { combinations: 73038, feasible: 1201, plans: 3 }

export type HeroStats = DotStats & { sample: boolean; finishedAt: number | null }

export function heroStats(state: { runs: Record<string, Run>; lastDoneKey: string | null }): HeroStats {
  const run = state.lastDoneKey ? state.runs[state.lastDoneKey] : undefined
  const result = run?.result
  if (!result) return { ...SAMPLE_STATS, sample: true, finishedAt: null }
  return { combinations: result.stats.combinations, feasible: result.stats.feasible, plans: result.plans.length, sample: false, finishedAt: run.finishedAt }
}

export function useHeroStats(): HeroStats {
  const state = usePlanRunStore(useShallow((s) => ({ runs: s.runs, lastDoneKey: s.lastDoneKey })))
  return heroStats(state)
}
```

- [ ] **Step 4：確認通過** — Expected：PASS（4 個）；`npx tsc -b` 零錯誤。

- [ ] **Step 5：Commit**

```bash
git add frontend/src/features/home/heroStats.ts frontend/src/features/home/heroStats.test.ts
git commit -m "feat(home): 首頁數字用上次的真結果，沒排過用標示範的真後端範例

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3：快速條件的日期和檢查 `quickPlan.ts`

**Files:**
- Create：`frontend/src/features/home/quickPlan.ts`、`frontend/src/features/home/quickPlan.test.ts`

**Interfaces:**
- Consumes：`dateUsable(date, ctx)`、`DateContext`（`@/features/wizard/validation`）、`nearestAvailable(available, today)`（`@/shared/lib/dates`）、`usesLocation(r)`（`@/shared/lib/origin`）、`PlanRequest`。
- Produces：
  - `quickDate(current: string, ctx: DateContext & { today: string }): string`：目前日期可用就用；不行就用 `nearestAvailable`；都沒有回 `''`
  - `type QuickField = 'area' | 'origin' | 'date' | 'budget'`
  - `quickMissing(r: PlanRequest, known: { areas?: string[]; stations?: number[] }, ctx: DateContext & { today: string }): QuickField[]`：照畫面順序列出還沒填好的格子。商圈不在清單裡算沒填；出發點：用目前位置算有填，否則車站 id 要在清單裡；日期用 `dateUsable`；預算 `> 0`。清單還沒載入（`undefined`）時那一格不檢查。

- [ ] **Step 1：寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { quickDate, quickMissing } from './quickPlan'

const ctx = { today: '2026-11-08', available: ['2026-11-08', '2026-11-09', '2026-11-12'] }
const known = { areas: ['taoyuan', 'zhongli'], stations: [103, 104] }
const req = { ...benchmarkRequest, area: 'taoyuan', origin_station_id: 103, date: '2026-11-09', budget_per_person: 1000 }

describe('quickDate', () => {
  it('目前的日期可以用就不動', () => expect(quickDate('2026-11-09', ctx)).toBe('2026-11-09'))
  it('過期或那天沒場次：換成從今天算起最近的可選日', () => {
    expect(quickDate('2026-11-01', ctx)).toBe('2026-11-08')
    expect(quickDate('2026-11-10', ctx)).toBe('2026-11-08')
  })
  it('一天都沒有：空字串，請使用者自己選', () => expect(quickDate('2026-11-09', { today: '2026-11-08', available: [] })).toBe(''))
})

describe('quickMissing', () => {
  it('四格都好：空的', () => expect(quickMissing(req, known, ctx)).toEqual([]))
  it('照畫面順序列出缺的格子', () => {
    expect(quickMissing({ ...req, area: 'nowhere', origin_station_id: 999, date: '', budget_per_person: 0 }, known, ctx)).toEqual(['area', 'origin', 'date', 'budget'])
  })
  it('用目前位置出發算有填', () => {
    expect(quickMissing({ ...req, origin_station_id: null, origin_lat: 24.95, origin_lng: 121.22 }, known, ctx)).toEqual([])
  })
  it('清單還沒載入：那一格先不檢查', () => {
    expect(quickMissing({ ...req, area: 'whatever', origin_station_id: 999 }, {}, ctx)).toEqual([])
  })
})
```

- [ ] **Step 2：確認失敗** — `npx vitest run src/features/home/quickPlan.test.ts` — Expected：FAIL。

- [ ] **Step 3：實作**

```ts
import type { PlanRequest } from '@/api/schemas'
import { dateUsable, type DateContext } from '@/features/wizard/validation'
import { nearestAvailable } from '@/shared/lib/dates'
import { usesLocation } from '@/shared/lib/origin'

/*
 * 首頁四格快速條件（規格 3.2；2026-11-07 使用者決定四格：商圈、出發、日期、預算）。
 * 其他條件沿用 planStore 目前的值；想改就按「更多條件」進四步精靈。
 */
export type QuickField = 'area' | 'origin' | 'date' | 'budget'
type Ctx = DateContext & { today: string }

/** 日期：可以用就不動；過期或沒場次就換最近可選日；一天都沒有回空字串 */
export function quickDate(current: string, ctx: Ctx): string {
  if (dateUsable(current, ctx)) return current
  return ctx.available ? (nearestAvailable(ctx.available, ctx.today) ?? '') : current
}

/** 還沒填好的格子（照畫面順序）。清單還沒載入時那一格先不檢查 */
export function quickMissing(r: PlanRequest, known: { areas?: string[]; stations?: number[] }, ctx: Ctx): QuickField[] {
  const out: QuickField[] = []
  if (known.areas && !known.areas.includes(r.area)) out.push('area')
  const originOk = usesLocation(r) || (known.stations ? known.stations.includes(r.origin_station_id ?? -1) : true)
  if (!originOk) out.push('origin')
  if (!dateUsable(r.date, ctx)) out.push('date')
  if (!(r.budget_per_person > 0)) out.push('budget')
  return out
}
```
（`nearestAvailable` 的回傳型別若不同，照它實際的簽名調整；先 `grep -n "nearestAvailable" -A8 src/shared/lib/dates.ts` 看一次。）

- [ ] **Step 4：確認通過** — Expected：PASS（7 個）；`npx tsc -b` 零錯誤。

- [ ] **Step 5：Commit**

```bash
git add frontend/src/features/home/quickPlan.ts frontend/src/features/home/quickPlan.test.ts
git commit -m "feat(home): 快速條件的日期自動換可選日、檢查四格缺什麼

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4：點陣動畫 `DotField`＋首頁標題 `HomeHero`

**Files:**
- Create：`frontend/src/features/home/DotField.tsx`、`frontend/src/features/home/HomeHero.tsx`

**Interfaces:**
- Consumes：Task 1 `layoutDots`、`dotCount`、`MAX_DOTS`、`PHONE_BREAKPOINT`、`DotStats`；Task 2 `useHeroStats`；Task 4（第 2 批）`useApplyTheme` 回傳的 `Theme`（用來在夜／日切換時重畫，從 `@/shared/theme/theme` 的 `useThemeStore`＋`resolveTheme`＋`useSystemDark` 取得目前的 theme，或在 `HomeHero` 呼叫 `useApplyTheme()` 不行——它會重複寫 `<html>`；改用 `resolveTheme(useThemeStore(s => s.pref), useSystemDark())`）。
- Produces：`<DotField stats={DotStats} theme={Theme} />`（default export，給 `lazy` 用）；`<HomeHero />`。

**DotField 規格（照做）**
- 外層 `div` 固定高度：手機 `h-56`（224px）、`sm:h-72`（288px），寬度 100%；裡面一個 `<canvas aria-hidden>` 填滿。先預留高度，載入前後版面不跳。
- 用 `ResizeObserver` 取寬高；`devicePixelRatio` 處理清晰度（canvas 實際像素＝CSS 大小 × dpr，`ctx.scale(dpr, dpr)`）。
- 點距 `GAP = 5`、點大小 `2`（px，正方形 `fillRect`，比圓快）。點數 `dotCount(w, h, GAP, w < PHONE_BREAKPOINT ? MAX_DOTS.phone : MAX_DOTS.desktop)`；`layoutDots(stats, 點數)`。第 i 個點的位置：`col = i % cols`、`row = floor(i / cols)`，`cols = floor(w / GAP)`。
- 顏色：每次畫之前用 `getComputedStyle(document.documentElement)` 讀 `--zg-flow`、`--muted-foreground`、`--zg-glow`。
- 時間軸（毫秒，`t` 從 0 開始；用 `requestAnimationFrame`；組件卸載時 `cancelAnimationFrame`）：
  - 0–600：全部點從透明淡入成 `--zg-flow`、alpha 0.55
  - 900–2100：`stage 0` 的點變成 `--muted-foreground`、alpha 0.18（熄掉）
  - 2400–3300：`stage 1` 的點變成 `--muted-foreground`、alpha 0.3；`stage 2` 的點放大到 6px、`--zg-flow` alpha 1，外圈畫 14px 的 `--zg-glow` 光暈
  - 3300 以後停止重畫（最後一格）
  - 兩段之間用 `t` 線性插值；寫一個小函式 `mix(t, start, end)` 回傳 0～1。
- `useReducedMotion()` 為真時：只畫最後一格，不跑 rAF。
- `theme` 改變時：用目前的 `t`（動畫結束後就是最後一格）重畫一次。
- `stats` 或尺寸改變時：重新 layout；動畫不重播（已經播完就直接畫最後一格）。

**HomeHero 規格（照做）**
- `<section>`，`mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-20`。
- 小標 `ZERO GAP · 零空檔`（沿用舊 Hero 的樣式）。
- `<h1>`：「電影、晚餐、回家的車，」換行「`<span className="text-zg-flow">`每一段都接得上。`</span>`」。字級 `text-4xl sm:text-6xl font-bold leading-tight`。**不要淡入**（LCP 元素，見舊 Hero 註解）。
- 說明一行：「填四個條件，系統把當天所有場次和餐廳交叉比對，只留下時間真的接得起來的行程。」
- 數字列（`zg-figure`，`<p>` 讓螢幕閱讀器念完整句）：「`73,038` 種組合 → `1,201` 種每段接得上 → `3` 個給你」，數字用 `toLocaleString('zh-TW')`；下面小字：
  - 示範時：「示範：一次真實後端規劃的數字」
  - 自己排過：「你上次排的（MM/DD HH:mm）」（`finishedAt` 用 `toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })`）
  - 再一行：「每點約代表 N 種組合」，N＝`Math.round(perDot)`（`perDot` 用 `layoutDots` 算，`HomeHero` 依目前視窗寬度估點數；寫一個 `useDotsPerDot(stats)` 小 hook 或把這行放進 `DotField` 裡由它回報——**放進 DotField 底下一起渲染**比較單純：DotField 下方 `<p className="text-xs text-muted-foreground">`。）
- 點陣：`const DotField = lazy(() => import('./DotField'))`；`<Suspense fallback={<div className="h-56 sm:h-72" />}>`。在標題出現後才載入：用 `useEffect` 設 `ready=true`（下一個畫面）或 `requestIdleCallback`，`ready` 前只渲染 fallback。

- [ ] **Step 1：實作兩個元件**（照上面規格寫；`DotField` 的 `mix`、時間軸常數放在檔案上方並註解）。

- [ ] **Step 2：型別、lint**：`npx tsc -b && npm run lint` — Expected：0 錯誤。

- [ ] **Step 3：暫時掛上去看一眼**：在 `IntroPage.tsx` 最上面先放 `<HomeHero />`（Task 5 才拿掉舊 Hero）。背景開 `npm run dev -- --port 5180 --strictPort`，把下面存成 `${TMPDIR:-/tmp}/zg-shot.mjs` 再 `node "${TMPDIR:-/tmp}/zg-shot.mjs"`：
```js
import { chromium } from '/Users/samuel/Desktop/JEV/ZeroGap/team-redesign/frontend/node_modules/@playwright/test/index.mjs'
const out = process.env.TMPDIR || '/tmp'
const browser = await chromium.launch()
for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  for (const colorScheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport, colorScheme })
    await page.goto('http://localhost:5180/')
    await page.waitForTimeout(4000) // 等點陣動畫跑完（3.3 秒）
    await page.screenshot({ path: `${out}/zg-home-${name}-${colorScheme}.png` })
    await page.close()
  }
}
await browser.close()
```
用 Read 工具打開這 4 張圖，在報告裡寫你看到什麼（點有沒有、三個亮點在不在、數字和標題有沒有被擋、夜／日顏色對不對）。看完關掉 dev server。`IntroPage.tsx` 暫時加的那行留著，Task 5 會整理。

- [ ] **Step 4：Commit**

```bash
git add frontend/src/features/home/DotField.tsx frontend/src/features/home/HomeHero.tsx frontend/src/features/intro/IntroPage.tsx
git commit -m "feat(home): 首頁標題、大數字、點陣剪枝動畫（Canvas，延遲載入，尊重減少動態）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5：四格快速條件 `QuickPlan`＋首頁組裝＋流程測試

**Files:**
- Create：`frontend/src/features/home/QuickPlan.tsx`、`frontend/e2e/home.e2e.ts`
- Modify：`frontend/src/features/intro/IntroPage.tsx`、`frontend/e2e/flows.e2e.ts`
- Delete：`frontend/src/features/intro/Hero.tsx`

**Interfaces:**
- Consumes：Task 3 `quickDate`、`quickMissing`、`QuickField`；`usePlanStore`（`request`、`setRequest`）；`useAreas`、`useStations`、`failure`（`@/api/queries`）；`useDateContext`；`atStation`、`usesLocation`、`LOCATION_NAME`（`@/shared/lib/origin`）；`stationDisplay`（`@/shared/lib/format`）；`BUDGET_OPTIONS`（`@/shared/lib/config`）；`SCENARIOS`（`@/features/intro/scenarios`）；`StationPicker`、`DateCalendar`、`Chips`（精靈零件）；`Popover`、`PopoverTrigger`、`PopoverContent`（`@/components/ui/popover`）；`Button`（`@/components/ui/button`）；`LoadError`（`@/shared/ui/LoadError`，若沒有就看 `StepShell` 怎麼顯示載入失敗，照做）。

**QuickPlan 規格（照做）**
- `<section aria-labelledby="quick-title" className="mx-auto max-w-6xl px-4 sm:px-6">`，標題 `<h2 id="quick-title">` 「排一個晚上」（視覺上小字也可以，但要有）。
- 卡片 `zg-surface p-4 sm:p-6`，裡面四格（`grid gap-4 sm:grid-cols-2 lg:grid-cols-4`），每格是 `<fieldset>`＋`<legend>`：
  1. **去哪個商圈**：`Chips`，選項是 `useAreas()` 的商圈；選了 `setRequest({ area })`。
  2. **從哪出發**：按鈕顯示目前車站（`stationDisplay`）或「目前位置」或「選車站」；點開 `Popover` 裡放 `StationPicker`，選了 `setRequest(atStation(id))` 並關閉。用目前位置出發時，按鈕顯示 `LOCATION_NAME`，Popover 裡多一行「改用目前位置請到更多條件」。
  3. **哪天**：按鈕顯示日期（`formatDate`）；點開 `Popover` 放 `DateCalendar`（`available` 用 `useDateContext().available ?? []`、`today`）。
  4. **每人預算**：`Chips`，`BUDGET_OPTIONS`，標籤 `NT$ 800` 這種格式（看 `StepFood` 怎麼顯示，照做）。
- 進到首頁時：如果 `quickDate(request.date, ctx)` 跟 `request.date` 不同而且清單已載入，就 `setRequest({ date })`（照 `StepTime` 的 effect 寫法），日期格下方小字「原本的日期沒有場次，換成最近可以排的 M/D」。
- 主按鈕 `Button` 大尺寸「排行程」：
  - `quickMissing(request, { areas, stations }, ctx)` 有缺：不送出，把第一個缺的格子 `focus()`，並在那一格下方顯示紅字（「請選要去的商圈」「請選出發的車站」「請選日期」「請選預算」），用 `aria-describedby` 連起來。
  - 用目前位置出發：`navigate('/plan/4')`（精靈會重新定位；首頁不處理定位）。
  - 都好了：`navigate('/result', { state: { replay: true } })`（跟精靈的 `submit` 一樣）。
- 主按鈕旁邊次要連結「更多條件（時間、片型、料理…）」→ `/plan/1`。
- 卡片下方「常見情境」：`SCENARIOS` 做成小按鈕，點了 `setRequest(s.patch)`（只改時間、順序、預算，不跳頁），按鈕 `aria-pressed` 表示目前條件是否符合那個情境。
- 載入失敗：顯示錯誤說明＋「再試一次」（重抓失敗的 query），不要整塊空白。
- 首頁閒置時預先下載精靈和結果頁的程式（沿用 `IntroPage` 現有的 `requestIdleCallback` 寫法，多加 `import('@/features/result/ResultPage')`）。

**IntroPage**：順序 `<HomeHero />`、`<QuickPlan />`、`<TimelinePreview />`、`<PainCompare />`、`<ThreeSteps />`；拿掉 `<Hero />` 並刪除 `Hero.tsx`（`SCENARIOS` 留在 `scenarios.ts`）。`ThreeSteps` 裡若有「開始規劃」連結，改指向 `#quick-title` 或保留到 `/plan/1`——看它的文案，選不會讓人迷路的那個並在報告說明。

- [ ] **Step 1：先寫流程測試（會失敗）** `frontend/e2e/home.e2e.ts`：
```ts
import { expect, test } from '@playwright/test'

test.describe('首頁', () => {
  test('標題、示範數字、四格快速條件都在；點陣在減少動態時直接是最後一格', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('每一段都接得上')
    await expect(page.getByText('73,038')).toBeVisible()
    await expect(page.getByText('示範：一次真實後端規劃的數字')).toBeVisible()
    await expect(page.getByText(/每點約代表 \d+ 種組合/)).toBeVisible()
    for (const name of ['去哪個商圈', '從哪出發', '哪天', '每人預算']) {
      await expect(page.getByRole('group', { name })).toBeVisible()
    }
  })

  test('四格填好按「排行程」直接到結果頁；之後首頁改用上次的真數字', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('group', { name: '每人預算' }).getByRole('radio', { name: /1,000/ }).click()
    await page.getByRole('button', { name: '排行程' }).click()
    await expect(page).toHaveURL(/\/result/)
    await expect(page.getByRole('heading', { name: /每一段都接得上/ })).toBeVisible({ timeout: 30_000 })
    await page.goto('/')
    await expect(page.getByText(/你上次排的/)).toBeVisible()
  })

  test('缺商圈時不送出，焦點跳到那一格並說明', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('zg-plan', JSON.stringify({ state: { request: { area: '' }, selectedRank: 1 }, version: 3 })))
    await page.goto('/')
    await page.getByRole('button', { name: '排行程' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('請選要去的商圈')).toBeVisible()
  })

  test('「更多條件」進四步精靈', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /更多條件/ }).click()
    await expect(page).toHaveURL(/\/plan\/1/)
  })

  test('常見情境只改條件、不跳頁', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /小資之夜/ }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('group', { name: '每人預算' }).getByRole('radio', { name: /500/ })).toHaveAttribute('aria-checked', 'true')
  })
})
```
（`Chips` 的選項 role 若不是 `radio`，照它實際的 role 改；`zg-plan` 暫存的 `version` 照 `planStore.ts` 目前的值。壞掉的暫存會被 `persistSafe` 逐欄驗證，`area: ''` 會被保留成「沒選」——確認這個前提，不成立就改用「選一個不存在的商圈代碼」。）
Run：`npx playwright test e2e/home.e2e.ts --project=chromium` — Expected：FAIL。

- [ ] **Step 2：實作 `QuickPlan.tsx`、改 `IntroPage.tsx`、刪 `Hero.tsx`**（照上面規格）。

- [ ] **Step 3：改舊測試的入口**：`e2e/flows.e2e.ts` 第 15 行附近的 helper 原本點首頁的「開始規劃」連結；改成 `page.goto('/plan/1')` 或點「更多條件」，讓原本走四步精靈的測試照舊。`grep -rn "開始規劃" e2e src` 確認沒有別處依賴舊 Hero。

- [ ] **Step 4：跑測試**
```bash
npx playwright test e2e/home.e2e.ts
npm run predemo
npm run build && npm run perf
```
Expected：home 全部專案通過；predemo 全過；perf 首頁 Slow 4G LCP < 2.0 秒（記下數字）。超過的話：確認點陣是延遲載入、首頁沒有 import 範例 JSON、`HomeHero` 的標題沒有淡入。

- [ ] **Step 5：Commit**

```bash
git add frontend/src/features/home/QuickPlan.tsx frontend/src/features/intro/IntroPage.tsx frontend/e2e/home.e2e.ts frontend/e2e/flows.e2e.ts
git rm -q frontend/src/features/intro/Hero.tsx
git commit -m "feat(home): 首頁四格快速條件（商圈、出發、日期、預算），四步精靈改成「更多條件」

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6：文件

**Files:**
- Create：`frontend/docs/導讀_10_首頁.md`
- Modify：`frontend/README.md`、`docs/superpowers/specs/2026-11-07-frontend-redesign-design.md`（第 11 節交付表第 3 批標 ✅＋第 2 節加 D13）、這份計畫的進度表

- [ ] **Step 1：導讀 10**（繁體中文、比喻、短句；給組員和使用者）：1. 首頁長什麼樣（四格、按一下就排）2. 點陣剪枝在說什麼（比喻：一面燈牆，每盞燈是一種組合；照真實比例熄燈；為什麼只有三層）3. 數字從哪來（上次的真結果／示範）4. 手機和效能（抽樣上限、延遲載入、`npm run perf` 的實際數字）5. 減少動態和無障礙 6. 改了哪些檔案。
- [ ] **Step 2：規格**：第 2 節決定表加一列 `| D13 | 首頁快速條件改成四格：商圈、出發、日期、預算（車站沒有座標，前端算不出最近商圈；2026-11-07 使用者決定） |`；3.2 第 1 步的「三格快速條件」改成「四格」並刪掉「商圈依出發點」；第 11 節第 3 批那列後面加「✅（PR 待開）」。
- [ ] **Step 3：README**：首頁一節更新成新的樣子＋導讀 10 連結。
- [ ] **Step 4：進度表**（下面）填上各 Task 的 commit。
- [ ] **Step 5：Commit**：`docs(frontend): 導讀 10 首頁；規格 D13 四格；README、計畫進度`（結尾同樣的 Co-Authored-By）。

---

### Task 7：推分支、開 PR（不合併）

- [ ] `cd frontend && npm run predemo`（最後確認）
- [ ] `git log --format='%ae' feat/frontend-foundation..HEAD | sort | uniq -c`：不能出現 `chensamuel0123@gmail.com`
- [ ] `git push -u git@github.com:RyanWu9863/ZeroGap.git feat/home-quick`
- [ ] `gh pr create -R RyanWu9863/ZeroGap --base feat/frontend-foundation --head feat/home-quick --title "前端第 3 批：首頁點陣剪枝＋四格快速條件（疊在 #3 上）" --body-file …`：做了什麼、截圖說明（文字）、測試和 perf 數字、「疊在 #3 上，請先合併 #3」、最後一行 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。**不合併。**

---

## 進度表

| Task | 狀態 |
|---|---|
| 1 點陣模型 | 完成：21a4bff |
| 2 首頁數字來源 | 完成：18b9ae8 |
| 3 快速條件檢查 | 完成：910ac3e、53bc0e6（晚上的日期規則） |
| 4 點陣動畫＋標題 | 完成：06bc68c、489e73b |
| 5 四格表單＋首頁組裝 | 完成：8ba5ff5、111d822、47497aa |
| 6 文件 | 完成：本次 commit |
| 7 推分支、開 PR | ✅ 最終審查修正 31acc71；PR 疊在 #3 上（未合併） |
