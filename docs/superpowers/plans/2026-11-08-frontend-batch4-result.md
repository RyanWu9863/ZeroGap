# 前端重新設計 第 4 批「結果頁」實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 排行程的流程改成「排程中真進度漏斗 → 排好後網址換成 `/p/{編號}` → 結果頁（錶盤＋瓶頸聚光燈、三方案滑動切換、時間軸、真實路線地圖、花費、『這個方案怎麼來的』、分享／加到行事曆）」，同一個 `/p/{編號}` 也是分享頁和 MCP 連結開的頁；拿掉 `?exp=1`。

**Architecture:** `/result` 只負責「送出條件、顯示漏斗、排不出來時的說明」，排好就換到 `/p/:id`（React Router 的 `viewTransition`：漏斗最後的三個亮點飛成三張方案卡）。`/p/:id` 的資料先找這台瀏覽器排過的結果（`zg-plan-runs`），找不到才打 `GET /api/plans/{id}`（假資料模式由假後端存在 localStorage）。錶盤、瓶頸、行事曆、分享網址、漏斗文案、地圖路線快取都先寫成純函式和單元測試，畫面元件只負責畫。

**Tech Stack:** React 19、React Router 8（`viewTransition`）、TypeScript、Tailwind v4、SVG、Motion、Zustand、TanStack Query、zod 4、`@vis.gl/react-google-maps` 1.10.1（已在 package.json，Maps JS 的 `routes`、`places` 函式庫）、Vitest、Playwright。**不加新套件。**

**Spec:** `docs/superpowers/specs/2026-11-07-frontend-redesign-design.md`（3.2 主流程第 2～5 步、3.3 分享頁的特殊狀態、4.2 最後一段「三個亮點飛成三張方案卡」、4.3 真進度漏斗、4.4 錶盤＋瓶頸聚光燈、5 地圖、6 第一層「這個方案怎麼來的」、7 資料流、8 出錯時、10 測試）。後端介面以 `~/Desktop/JEV/ZeroGap/team-share` 的 `backend/app/saved_plans.py`、`api.py`（PR #5）為準。

## Global Constraints

- 工作資料夾 `~/Desktop/JEV/ZeroGap/team-redesign`，分支 **`feat/result-page`**：從 `feat/home-quick`（PR #6）開，已經併入 `feat/map-default`（PR #4，merge commit `7532ab5`）。PR 的 base 是 `feat/home-quick`，PR 說明寫「含 #4 的一個 commit」。
- `GET /api/plans/{id}` 回 `{ job_id, request, result, created_at, expires_at }`（`created_at`、`expires_at` 是 ISO 字串）；找不到或過期回 **404**、錯誤代碼 `NOT_FOUND`、訊息「找不到這份行程，可能已經超過 7 天」。`id` 就是 `job_id`：**32 碼小寫十六進位**（`/^[0-9a-f]{32}$/`），不符合的網址直接顯示「找不到」，不打後端。
- 分享連結保留 **7 天**（`expires_at`）。分享頁「過期」＝現在 ≥ `expires_at`，或**每個方案**的出發時間（`depart_at`）都已經過了。
- 結果頁網址 `/p/{id}`，第 2、3 個方案加 `?plan=2`、`?plan=3`；開發用的 `?mock=…` 情境參數要跟著帶過去，其他參數不帶。
- 「目前位置」出發的行程，座標照原樣存在後端（2026-11-07 使用者決定「照原樣存」）；**分享按鈕旁要提醒**「這個連結含有你出發的大概位置（約 100 公尺內），只傳給信任的人」。
- 假資料模式（`USE_MOCK` 或展示模式）的分享連結只在同一台瀏覽器打得開，分享按鈕旁要照實說。
- 錶盤：從出門（`depart_at`）到到家（`home_at`）是一段 **300°** 的弧，從 12 點鐘方向往左 150°（`DIAL_START = -150`）順時針畫到 +150°，底下留缺口。顏色只用 token：搭車 `--zg-flow` 實線、走路 `--zg-flow` 虛線、電影 `--foreground`、用餐 `--muted-foreground`、候位 `--border`；聚光燈用緩衝三色（`bufferLevel`：寬鬆 `--zg-ok`、剛好 `--zg-snug`、偏緊 `--zg-tight`）。青色是唯一主色，不加新色相。
- 瓶頸＝時間軸上 `buffer_minutes` 最小的一步（一樣小取最前面的）；文案依 `buffer_gate`：`showtime` 趕不上開演、`last_order` 趕不上最後點餐、`return_trip` 趕不上預定那班車、`latest_return` 可能趕不上末班車。
- 漏斗：7 個階段照 `features/result/stages.ts`；`queued` 顯示「前面還有 N 個人」（N＝position−1，0 時「下一個就輪到你」）；`waiting_quota` 顯示「交通資料查詢中，約 N 秒」（沒給秒數就不寫秒數）；`aria-live="polite"` 只播目前的階段。
- 使用者畫面不出現 AI、Jev、LLM、機率（「這個方案怎麼來的」也一樣）。
- 地圖：Maps JS 的 `routes` 函式庫 `Route.computeRoutes`（`travelMode: 'WALKING'`、`fields: ['path']`）畫走路；搭車段畫起訖站之間的線並標車種，**不用 Google 建議的班次**；`place_id` 的餐廳用 `places` 函式庫的 `Place.fetchFields({ fields: ['location'] })` 查位置。查到的路線和位置用分享編號存 localStorage，**7 天**後丟掉。地圖捲到附近（`rootMargin: '300px'`）才載入。2026-11-07 查的官方價目（每月免費量／超過後每千次）：Dynamic Maps 10,000／US$7、Routes Compute Routes Essentials 10,000／US$5、Places Place Details Essentials 10,000／US$5。
- 每個動畫都有文字版；`prefers-reduced-motion` 時直接顯示最後一格、`viewTransition` 不播。
- 繁體中文、白話；每個 commit 前 `cd frontend && npm run predemo` 全過；只 add 自己改的檔案、不用 `git add -A`；commit 訊息繁體中文，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 不推送、不開 PR，直到 Task 10；開 PR 後**不合併**（合併會更新公開的展示站，要先問使用者）。
- 跟時間有關的測試一律固定時鐘（單元測試傳 `now`，Playwright 用 `page.clock.setFixedTime`，參考 `e2e/home.e2e.ts`），早上晚上跑結果一樣。

## 檔案地圖

| 路徑 | 做什麼 |
|---|---|
| `frontend/src/api/schemas.ts` | Task 1：`SavedPlan` |
| `frontend/src/api/client.ts` | Task 1：`getSavedPlan` |
| `frontend/src/api/savedPlans.ts`＋`.test.ts` | Task 1：`JOB_ID_RE`、`localSavedPlan`、`shareStatus`、`useSavedPlan` |
| `frontend/src/mocks/savedPlans.ts`＋`.test.ts` | Task 1：假後端的「存結果、拿結果」、`newJobId` |
| `frontend/src/mocks/server.ts`、`planResult.ts` | Task 1：每次規劃一個新編號，送出結果時存起來 |
| `frontend/src/features/result/planPath.ts`＋`.test.ts` | Task 2：`/p/:id` 的網址組法 |
| `frontend/src/features/result/PlanPage.tsx` | Task 2 建立，Task 5～8 往裡加 |
| `frontend/src/features/result/ResultPage.tsx` | Task 2：只剩送出、漏斗、排不出來；排好換到 `/p/:id` |
| `frontend/src/app/router.tsx` | Task 2：加 `/p/:id` |
| `frontend/src/shared/theme/experiment.ts`、`features/result/funnel/`、`features/result/stage/` | Task 2：刪除（`?exp=1`） |
| `frontend/src/features/behind/BehindPage.tsx` | Task 2：拿掉 `useExperiment`，只留預設畫面 |
| `frontend/src/api/planRuns.ts` | Task 3：`Run.waitSeconds` |
| `frontend/src/features/result/funnelCopy.ts`＋`.test.ts`、`PlanFunnel.tsx` | Task 3：真進度漏斗（取代 `PlanProgress.tsx`） |
| `frontend/src/index.css` | Task 3：view transition 的時間和「減少動態」 |
| `frontend/src/features/result/dial/dialModel.ts`＋`.test.ts` | Task 4：錶盤幾何、瓶頸、文案 |
| `frontend/src/features/result/dial/PlanDial.tsx` | Task 5：錶盤＋聚光燈 |
| `frontend/src/features/result/PlanSwitcher.tsx` | Task 5：←／→、滑動、飛入的名字 |
| `frontend/src/shared/lib/ics.ts`＋`.test.ts` | Task 6：行事曆檔 |
| `frontend/src/shared/lib/clipboard.ts` | Task 6：從 `CopyButton.tsx` 抽出 `writeClipboard` |
| `frontend/src/features/result/PlanActions.tsx` | Task 6：分享、複製文字、加到行事曆、改條件重排 |
| `frontend/src/features/result/HowItWasMade.tsx`＋`.test.tsx`、`PlanHeader.tsx` | Task 7：怎麼來的、排好時間、過期／找不到 |
| `frontend/src/features/result/map/*` | Task 8：真實路線、Places、快取、捲到附近才載入 |
| `frontend/e2e/result.e2e.ts`（新）、`flows.e2e.ts`、`experience.e2e.ts`（刪掉 `?exp=1` 的部分）、`a11y.e2e.ts` | Task 2、3、5～9 |
| `frontend/docs/導讀_11_結果頁.md`、`README.md`、規格第 11 節、這份計畫的進度表 | Task 9 |

---

### Task 1：分享資料層（後端格式、假後端存取、本機先找）

**Files:**
- Modify：`frontend/src/api/schemas.ts`、`frontend/src/api/client.ts`、`frontend/src/mocks/server.ts`、`frontend/src/mocks/planResult.ts`
- Create：`frontend/src/api/savedPlans.ts`、`frontend/src/api/savedPlans.test.ts`、`frontend/src/mocks/savedPlans.ts`、`frontend/src/mocks/savedPlans.test.ts`

**Interfaces:**
- Produces：
  - `schemas.ts`：`export const SavedPlan = z.object({ job_id: z.string(), request: PlanRequest, result: PlanResult, created_at: z.string(), expires_at: z.string() })`、`export type SavedPlan`
  - `client.ts`：`getSavedPlan(id: string, signal?: AbortSignal): Promise<SavedPlan>`；找不到丟 `PlanError`，`code === 'NOT_FOUND'`、`status === 404`
  - `mocks/savedPlans.ts`：`newJobId(): string`、`mockSavePlan(doc: { job_id: string; request: PlanRequest; result: PlanResult }, now?: Date): void`、`mockLoadPlan(id: string, now?: Date): SavedPlan | null`、`MOCK_SAVED_KEY = 'zg-mock-saved'`、`SAVED_TTL_MS = 7 * 86_400_000`
  - `mocks/planResult.ts`：`mockResult(req, lowConfidence, jobId = 'f'.repeat(32))`
  - `api/savedPlans.ts`：`JOB_ID_RE`、`localSavedPlan(runs: Record<string, Run>, id: string): SavedPlan | null`、`shareStatus(doc: SavedPlan, now: Date): 'ok' | 'expired'`、`useSavedPlan(id: string): { state: 'loading' | 'found' | 'not_found' | 'error'; doc: SavedPlan | null; error: unknown; retry: () => void }`

- [ ] **Step 1：寫失敗的測試** `frontend/src/mocks/savedPlans.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { benchmarkRequest } from './request'
import { mockResult } from './planResult'
import { MOCK_SAVED_KEY, mockLoadPlan, mockSavePlan, newJobId, SAVED_TTL_MS } from './savedPlans'

const mem = new Map<string, string>()
beforeEach(() => {
  mem.clear()
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage
})

const NOW = new Date('2026-11-08T10:00:00+08:00')

describe('假後端的分享編號', () => {
  it('編號是 32 碼小寫十六進位，每次不一樣', () => {
    const a = newJobId()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(newJobId()).not.toBe(a)
  })

  it('存了拿得回來，帶排好時間和 7 天後的到期時間', () => {
    const id = newJobId()
    const result = mockResult(benchmarkRequest, false, id)
    mockSavePlan({ job_id: id, request: benchmarkRequest, result }, NOW)
    const doc = mockLoadPlan(id, NOW)!
    expect(doc.result.job_id).toBe(id)
    expect(doc.request).toEqual(benchmarkRequest)
    expect(Date.parse(doc.expires_at) - Date.parse(doc.created_at)).toBe(SAVED_TTL_MS)
  })

  it('超過 7 天就拿不到（跟後端的 404 一樣）', () => {
    const id = newJobId()
    mockSavePlan({ job_id: id, request: benchmarkRequest, result: mockResult(benchmarkRequest, false, id) }, NOW)
    expect(mockLoadPlan(id, new Date(NOW.getTime() + SAVED_TTL_MS + 1))).toBeNull()
  })

  it('沒存過、存的東西壞掉都回 null，不丟錯', () => {
    expect(mockLoadPlan('0'.repeat(32), NOW)).toBeNull()
    mem.set(MOCK_SAVED_KEY, '{壞掉')
    expect(mockLoadPlan('0'.repeat(32), NOW)).toBeNull()
  })

  it('最多留 20 份，舊的先丟', () => {
    const ids = Array.from({ length: 21 }, () => newJobId())
    ids.forEach((id, i) => mockSavePlan({ job_id: id, request: benchmarkRequest, result: mockResult(benchmarkRequest, false, id) }, new Date(NOW.getTime() + i)))
    expect(mockLoadPlan(ids[0], NOW)).toBeNull()
    expect(mockLoadPlan(ids[20], NOW)).not.toBeNull()
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run：`cd frontend && npx vitest run src/mocks/savedPlans.test.ts`
Expected：FAIL（找不到 `./savedPlans`）

- [ ] **Step 3：實作** `frontend/src/mocks/savedPlans.ts`

```ts
import type { PlanRequest, PlanResult, SavedPlan } from '@/api/schemas'

/*
 * 假後端的「取餐號碼牌」（規格 7 假資料模式）：排過的結果存在這台瀏覽器的 localStorage，
 * 所以 GitHub Pages 展示站上同一台瀏覽器打得開 /p/:id；換一台就打不開（畫面會照實說）。
 * 跟真後端一樣保留 7 天；最多留 20 份，免得塞爆 localStorage。
 */
export const MOCK_SAVED_KEY = 'zg-mock-saved'
export const SAVED_TTL_MS = 7 * 86_400_000
const KEEP = 20

/** 32 碼小寫十六進位，跟後端的 job_id 一樣 */
export function newJobId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function readAll(): SavedPlan[] {
  try {
    const raw = localStorage.getItem(MOCK_SAVED_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? (list as SavedPlan[]) : []
  } catch {
    return []
  }
}

export function mockSavePlan(doc: { job_id: string; request: PlanRequest; result: PlanResult }, now = new Date()): void {
  const saved: SavedPlan = { ...doc, created_at: now.toISOString(), expires_at: new Date(now.getTime() + SAVED_TTL_MS).toISOString() }
  const rest = readAll().filter((d) => d.job_id !== doc.job_id)
  const next = [...rest, saved].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, KEEP)
  try {
    localStorage.setItem(MOCK_SAVED_KEY, JSON.stringify(next))
  } catch {
    // 存不進去（私密瀏覽、空間滿了）就算了：只是分享連結打不開，跟真後端記憶體滿時一樣
  }
}

export function mockLoadPlan(id: string, now = new Date()): SavedPlan | null {
  const doc = readAll().find((d) => d.job_id === id)
  return doc && Date.parse(doc.expires_at) > now.getTime() ? doc : null
}
```

`schemas.ts` 在 `PlanResult` 後面加：

```ts
/** GET /api/plans/{id}（分享連結，子專案 ①）：當初的條件和結果，保留 7 天 */
export const SavedPlan = z.object({ job_id: z.string(), request: PlanRequest, result: PlanResult, created_at: ISO, expires_at: ISO })
```

並在檔尾的型別區加 `export type SavedPlan = z.infer<typeof SavedPlan>`。

`planResult.ts`：`export function mockResult(req: PlanRequest, lowConfidence: boolean, jobId = 'f'.repeat(32)): PlanResult`，回傳的 `job_id: jobId`。

`server.ts` 的 `mockPlanResponse`：函式開頭 `const jobId = newJobId()`，`frames(req, jobId)` 的兩個 `queued` 事件用 `jobId`，結果事件用 `mockResult(req, low, jobId)`；在送出 `result` 那一格的計時器裡（`event === 'result'` 時）先呼叫 `mockSavePlan({ job_id: jobId, request: req, result: data as PlanResult })` 再 enqueue。被取消的規劃不會存（計時器被清掉）。

- [ ] **Step 4：跑測試確認通過**

Run：`cd frontend && npx vitest run src/mocks/savedPlans.test.ts`
Expected：PASS（5 個）

- [ ] **Step 5：寫失敗的測試** `frontend/src/api/savedPlans.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { Run } from './planRuns'
import { requestKey } from './planRuns'
import { benchmarkRequest } from '@/mocks/request'
import { mockResult } from '@/mocks/planResult'
import { JOB_ID_RE, localSavedPlan, shareStatus } from './savedPlans'

const ID = 'a'.repeat(32)
const result = mockResult(benchmarkRequest, false, ID)
const done = (finishedAt: number): Run => ({
  status: 'done', startedAt: finishedAt - 1000, position: null, stage: null, waitingQuota: false, waitSeconds: null,
  combinations: 1880, feasible: 39, result, error: null, finishedAt,
})

describe('分享編號', () => {
  it('只接受 32 碼小寫十六進位', () => {
    expect(JOB_ID_RE.test(ID)).toBe(true)
    expect(JOB_ID_RE.test('mock-job')).toBe(false)
    expect(JOB_ID_RE.test('A'.repeat(32))).toBe(false)
  })
})

describe('這台瀏覽器排過的結果先拿來用', () => {
  it('找得到同一個編號就組成分享頁要的格式', () => {
    const t = Date.parse('2026-11-08T10:00:00+08:00')
    const doc = localSavedPlan({ [requestKey(benchmarkRequest)]: done(t) }, ID)!
    expect(doc.request).toEqual(benchmarkRequest)
    expect(doc.result.job_id).toBe(ID)
    expect(doc.created_at).toBe(new Date(t).toISOString())
    expect(Date.parse(doc.expires_at) - t).toBe(7 * 86_400_000)
  })
  it('沒有這個編號、或還沒跑完，回 null', () => {
    expect(localSavedPlan({}, ID)).toBeNull()
    expect(localSavedPlan({ [requestKey(benchmarkRequest)]: { ...done(1), status: 'running', result: null } }, ID)).toBeNull()
  })
})

describe('分享頁過期了沒', () => {
  const doc = { job_id: ID, request: benchmarkRequest, result, created_at: '2026-11-08T10:00:00+08:00', expires_at: '2026-11-15T10:00:00+08:00' }
  const firstDepart = Math.min(...result.plans.map((p) => Date.parse(p.depart_at)))
  const lastDepart = Math.max(...result.plans.map((p) => Date.parse(p.depart_at)))
  it('還沒出發、也還沒到期：ok', () => {
    expect(shareStatus(doc, new Date(firstDepart - 60_000))).toBe('ok')
  })
  it('還有方案沒出發：ok', () => {
    if (lastDepart > firstDepart) expect(shareStatus(doc, new Date(firstDepart + 1))).toBe('ok')
  })
  it('每個方案都出發過了：過期', () => {
    expect(shareStatus(doc, new Date(lastDepart))).toBe('expired')
  })
  it('超過 expires_at：過期', () => {
    expect(shareStatus({ ...doc, expires_at: '2026-11-08T09:00:00+08:00' }, new Date('2026-11-08T09:00:00+08:00'))).toBe('expired')
  })
})
```

（`waitSeconds` 是 Task 3 才加的欄位；這一步先在 `Run` 型別加上 `waitSeconds: number | null`、`blank()` 給 `null`，Task 3 再接上 SSE。）

- [ ] **Step 6：跑測試確認失敗**

Run：`cd frontend && npx vitest run src/api/savedPlans.test.ts`
Expected：FAIL（找不到 `./savedPlans`）

- [ ] **Step 7：實作** `frontend/src/api/savedPlans.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { getSavedPlan, PlanError } from './client'
import { usePlanRunStore, type Run } from './planRuns'
import type { PlanRequest, SavedPlan } from './schemas'

/*
 * 分享頁 /p/:id 的資料（規格 3.2 第 3 步、7）：
 * 1. 這台瀏覽器排過的（zg-plan-runs）直接用：剛排好換頁、重新整理都不用再打後端
 * 2. 找不到才打 GET /api/plans/{id}（假資料模式由假後端的 localStorage 回答）
 */
export const JOB_ID_RE = /^[0-9a-f]{32}$/
const TTL_MS = 7 * 86_400_000

export function localSavedPlan(runs: Record<string, Run>, id: string): SavedPlan | null {
  for (const [key, run] of Object.entries(runs)) {
    if (run.status !== 'done' || run.result?.job_id !== id || run.finishedAt == null) continue
    return {
      job_id: id,
      request: JSON.parse(key) as PlanRequest,
      result: run.result,
      created_at: new Date(run.finishedAt).toISOString(),
      expires_at: new Date(run.finishedAt + TTL_MS).toISOString(),
    }
  }
  return null
}

/** 過期＝超過保留期限，或每個方案的出發時間都過了（規格 3.3） */
export function shareStatus(doc: SavedPlan, now: Date): 'ok' | 'expired' {
  const t = now.getTime()
  if (t >= Date.parse(doc.expires_at)) return 'expired'
  return doc.result.plans.every((p) => Date.parse(p.depart_at) <= t) ? 'expired' : 'ok'
}

export function useSavedPlan(id: string) {
  const valid = JOB_ID_RE.test(id)
  const local = usePlanRunStore((s) => (valid ? localSavedPlan(s.runs, id) : null))
  const q = useQuery({
    queryKey: ['saved-plan', id],
    queryFn: ({ signal }) => getSavedPlan(id, signal),
    enabled: valid && !local,
    staleTime: Infinity,
    // 404 不重試；連不上、等太久照 TanStack Query 預設重試
    retry: (n, e) => !(e instanceof PlanError && e.code === 'NOT_FOUND') && n < 2,
  })
  const notFound = !valid || (q.error instanceof PlanError && q.error.code === 'NOT_FOUND')
  const doc = local ?? q.data ?? null
  const state = doc ? 'found' : notFound ? 'not_found' : q.isError && !q.isFetching ? 'error' : 'loading'
  return { state, doc, error: q.error, retry: () => void q.refetch() } as const
}
```

注意：`usePlanRunStore` 的 selector 每次回新物件會讓畫面一直重畫；用 `useShallow` 或改成先選 `s.runs` 再 `useMemo(() => localSavedPlan(runs, id), [runs, id])`。實作時用後者。

`client.ts` 加：

```ts
/** 分享連結（GET /api/plans/{id}）。找不到或過期：PlanError，code NOT_FOUND、status 404 */
export async function getSavedPlan(id: string, signal?: AbortSignal): Promise<SavedPlan> {
  if (mocking()) {
    await new Promise((r) => setTimeout(r, 120))
    const doc = mockLoadPlan(id)
    if (!doc) throw new PlanError({ code: 'NOT_FOUND', message: '找不到這份行程，可能已經超過 7 天' }, 404)
    return parseOrThrow(SavedPlan, doc, '分享的行程')
  }
  return parseOrThrow(SavedPlan, await getJson(`/api/plans/${encodeURIComponent(id)}`, signal), '分享的行程')
}
```

（`mockLoadPlan` 從 `@/mocks/savedPlans` 匯入；不要讓 `mocks/` 反過來匯入 `client.ts`，免得循環匯入。）

- [ ] **Step 8：跑測試、全套檢查**

Run：`cd frontend && npx vitest run src/api/savedPlans.test.ts src/mocks && npm run predemo`
Expected：PASS；predemo 全過（`grep -rn "mock-job" src e2e` 應該沒有剩下）

- [ ] **Step 9：Commit**

```bash
git add frontend/src/api/schemas.ts frontend/src/api/client.ts frontend/src/api/planRuns.ts frontend/src/api/savedPlans.ts frontend/src/api/savedPlans.test.ts frontend/src/mocks/savedPlans.ts frontend/src/mocks/savedPlans.test.ts frontend/src/mocks/server.ts frontend/src/mocks/planResult.ts
git commit -m "feat(frontend): 分享連結的資料層：後端格式、假後端存 7 天、這台排過的先拿來用

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2：流程重組 `/result` → `/p/:id`，拿掉 `?exp=1`

**Files:**
- Create：`frontend/src/features/result/planPath.ts`、`frontend/src/features/result/planPath.test.ts`、`frontend/src/features/result/PlanPage.tsx`、`frontend/e2e/result.e2e.ts`
- Modify：`frontend/src/app/router.tsx`、`frontend/src/features/result/ResultPage.tsx`、`frontend/src/features/behind/BehindPage.tsx`、`frontend/e2e/flows.e2e.ts`、`frontend/e2e/experience.e2e.ts`、`frontend/e2e/a11y.e2e.ts`、`frontend/e2e/components.e2e.ts`、`frontend/e2e/home.e2e.ts`（只改網址的期待）
- Delete：`frontend/src/shared/theme/experiment.ts`、`frontend/src/features/result/funnel/`、`frontend/src/features/result/stage/`，以及 `features/behind/` 裡只有 `?exp=1` 才用到的檔案（先 `grep -rn` 確認沒有別人用）

**Interfaces:**
- Consumes：Task 1 的 `useSavedPlan`、`JOB_ID_RE`
- Produces：
  - `planPath(id: string, rank: number, search: string): string` → `/p/{id}`，`rank !== 1` 加 `plan=`，原網址有 `mock` 參數就帶上
  - `rerunPath(request: PlanRequest, search: string): string` → `/result?…`（`writeRequest(new URLSearchParams(), request, 1)`，原網址的 `mock` 帶上）
  - `PlanPage`（路由 `/p/:id` 的元件）：內部 `PlanView({ doc, rank, onRank })`，Task 5～8 往 `PlanView` 裡加東西

- [ ] **Step 1：寫失敗的測試** `planPath.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { planPath, rerunPath } from './planPath'

const ID = 'b'.repeat(32)
describe('結果頁網址', () => {
  it('第 1 個方案不帶 plan', () => expect(planPath(ID, 1, '')).toBe(`/p/${ID}`))
  it('第 2、3 個方案帶 plan', () => expect(planPath(ID, 3, '?from=1')).toBe(`/p/${ID}?plan=3`))
  it('開發用的 mock 情境跟著帶，其他條件參數不帶', () =>
    expect(planPath(ID, 2, '?from=103&to=taoyuan&mock=low_confidence')).toBe(`/p/${ID}?plan=2&mock=low_confidence`))
})
describe('用同樣條件重排的網址', () => {
  it('條件寫回 /result，mock 情境跟著帶', () => {
    const url = new URL(rerunPath(benchmarkRequest, '?plan=2&mock=no_solution'), 'http://x')
    expect(url.pathname).toBe('/result')
    expect(url.searchParams.get('to')).toBe(benchmarkRequest.area)
    expect(url.searchParams.get('plan')).toBeNull()
    expect(url.searchParams.get('mock')).toBe('no_solution')
  })
})
```

- [ ] **Step 2：跑測試確認失敗** — Run：`cd frontend && npx vitest run src/features/result/planPath.test.ts`，Expected：FAIL

- [ ] **Step 3：實作** `planPath.ts`

```ts
import type { PlanRequest } from '@/api/schemas'
import { writeRequest } from './urlState'

/** 開發用的假資料情境（?mock=…）要跟著換頁，其他參數不帶 */
const keepMock = (search: string, p: URLSearchParams) => {
  const mock = new URLSearchParams(search).get('mock')
  if (mock) p.set('mock', mock)
  return p
}

/** 排好的行程：/p/{編號}，第 2、3 個方案加 ?plan= */
export function planPath(id: string, rank: number, search: string): string {
  const p = new URLSearchParams()
  if (rank !== 1) p.set('plan', String(rank))
  const q = keepMock(search, p).toString()
  return `/p/${id}${q ? `?${q}` : ''}`
}

/** 改條件重排、過期了用同樣條件重排：回到 /result 送出 */
export function rerunPath(request: PlanRequest, search: string): string {
  return `/result?${keepMock(search, writeRequest(new URLSearchParams(), request, 1)).toString()}`
}
```

- [ ] **Step 4：跑測試確認通過**（Expected：PASS 4 個）

- [ ] **Step 5：路由和兩個頁面**

1. `router.tsx` 在 `/result` 後面加：

```tsx
{
  path: '/p/:id',
  lazy: async () => ({ Component: (await import('@/features/result/PlanPage')).PlanPage }),
  hydrateFallbackElement: <PageLoading />,
},
```

2. `ResultPage.tsx` 改成只做「送出」：
   - 保留 `PickOrigin`、`StaleDate`、`usePlanRun`、取消、`NoSolution`、`ResultError`。
   - 刪掉 `useExperiment`、`FunnelRun`、`PlanStage`、`PlanSwitcher`、`Timeline`、`RouteMap`、`CostPanel`、`CopyButton`、換一部／換一家的狀態（這些搬到 `PlanPage`）。
   - 排好時（`run.status === 'done'` 且等待畫面的 `onDone` 已經呼叫過，或一進來就已經是 done）：
     ```ts
     navigate(planPath(run.result.job_id, rank, location.search), { replace: true, viewTransition: true })
     ```
     `rank` 用 `useResultState()` 的 `rank`。`replace: true` 讓上一頁直接回到首頁／精靈，不會回到又要重排的 `/result`。
   - 排程中掛上時就預先下載 `PlanPage`：`useEffect(() => { void import('./PlanPage') }, [])`。
3. `PlanPage.tsx`（新）：
   - `const { id = '' } = useParams()`、`const { state, doc, retry } = useSavedPlan(id)`。
   - `loading` → `<PageLoading />`；`not_found` → 先放一個簡單的「找不到這份行程，可能已經超過 7 天」＋回首頁連結（Task 7 換成正式的 `PlanMissing`）；`error` → `<ResultError error={null} onRetry={retry} />`。
   - `found` → `PlanView`：把原本 `ResultView` 從 `<ConditionBar>` 到底部固定按鈕的那一段搬過來，`request`、`result` 從 `doc` 來；方案編號讀 `?plan=`（`readRank(searchParams) ?? 1`），換方案用 `setSearchParams` 寫回 `plan`（`replace: true`）並呼叫 `usePlanStore.selectRank`。
   - `ConditionBar` 的 `onApply(patch)`：`replaceRequest({ ...doc.request, ...patch })`，然後 `navigate(rerunPath({ ...doc.request, ...patch }, location.search), { state: { replay: true } })`。
   - 頁面標題 `usePageTitle('你的行程')`。
4. `BehindPage.tsx`：拿掉 `useExperiment`，只留原本 `exp` 為 false 的那一支；`?exp=1` 才用到的 lazy 元件和檔案一起刪。
5. 刪 `shared/theme/experiment.ts`、`features/result/funnel/`、`features/result/stage/`；`grep -rn "experiment\|exp=1\|FunnelRun\|PlanStage" frontend/src frontend/e2e` 應該只剩文件。

- [ ] **Step 6：流程測試**

- `experience.e2e.ts`：刪掉只測 `?exp=1` 漏斗、輪盤、幕後三種視覺化的測試；地圖（`route-map`）的測試搬進新的 `e2e/result.e2e.ts`。檔案刪光就整個刪掉。
- `flows.e2e.ts`、`home.e2e.ts`、`components.e2e.ts`、`a11y.e2e.ts`：原本期待停在 `/result?…` 看結果的地方，改成 `await expect(page).toHaveURL(/\/p\/[0-9a-f]{32}/)`；看方案 2 的期待 `?plan=2`。
- `result.e2e.ts` 新增：
  ```ts
  test('排好後網址換成 /p/編號，重新整理還是同一份、不會重排', async ({ page }) => {
    // 用 flows.e2e.ts 既有的「從首頁四格送出」或直接開 /result?… 的寫法
    await expect(page).toHaveURL(/\/p\/([0-9a-f]{32})/)
    const url = page.url()
    await page.reload()
    await expect(page).toHaveURL(url)
    await expect(page.getByText('正在送出條件')).toHaveCount(0)
    await expect(page.getByRole('radiogroup', { name: '選擇方案' })).toBeVisible()
  })
  test('上一頁不會回到排程中', async ({ page }) => { /* 從首頁送出 → /p/… → goBack() → 回到首頁 */ })
  test('亂打的編號顯示找不到、不打後端', async ({ page }) => {
    await page.goto('/p/not-a-real-id')
    await expect(page.getByRole('heading', { name: /找不到這份行程/ })).toBeVisible()
  })
  test('格式對但沒排過的編號顯示找不到', async ({ page }) => {
    await page.goto(`/p/${'0'.repeat(32)}`)
    await expect(page.getByRole('heading', { name: /找不到這份行程/ })).toBeVisible()
  })
  ```

- [ ] **Step 7：全套檢查** — Run：`cd frontend && npm run predemo`，Expected：全過

- [ ] **Step 8：Commit**

```bash
git rm -r frontend/src/shared/theme/experiment.ts frontend/src/features/result/funnel frontend/src/features/result/stage
git add frontend/src/app/router.tsx frontend/src/features/result/planPath.ts frontend/src/features/result/planPath.test.ts frontend/src/features/result/PlanPage.tsx frontend/src/features/result/ResultPage.tsx frontend/src/features/behind frontend/e2e
git commit -m "feat(frontend): 排好後換到 /p/編號（重新整理不重排），拿掉 ?exp=1 的沉浸式零件

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

（`features/behind/` 裡刪掉的 `?exp=1` 專用檔案也用 `git rm`；commit 前 `git status` 確認沒有漏掉的刪除。）

---

### Task 3：排程中的真進度漏斗 `PlanFunnel`

**Files:**
- Create：`frontend/src/features/result/funnelCopy.ts`、`frontend/src/features/result/funnelCopy.test.ts`、`frontend/src/features/result/PlanFunnel.tsx`
- Modify：`frontend/src/api/planRuns.ts`（`waitSeconds` 接上 SSE）、`frontend/src/features/result/ResultPage.tsx`（換成 `PlanFunnel`）、`frontend/src/index.css`、`frontend/e2e/result.e2e.ts`
- Delete：`frontend/src/features/result/PlanProgress.tsx`

**Interfaces:**
- Consumes：`STAGES`、`stageIndex`（`stages.ts`）、`Run`
- Produces：
  - `queueText(position: number): string`、`quotaText(seconds: number | null): string`、`funnelHeadline(run: Run | undefined): string`
  - `PlanFunnel({ request, run, onDone, onCancel })`（跟舊的 `PlanProgress` 同一組 props）
  - 結束時三個亮點的 CSS `view-transition-name`：`zg-plan-1`、`zg-plan-2`、`zg-plan-3`（Task 5 的方案卡用同樣的名字）

- [ ] **Step 1：寫失敗的測試** `funnelCopy.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { Run } from '@/api/planRuns'
import { funnelHeadline, quotaText, queueText } from './funnelCopy'

const run = (p: Partial<Run>): Run => ({
  status: 'running', startedAt: 0, position: null, stage: null, waitingQuota: false, waitSeconds: null,
  combinations: null, feasible: null, result: null, error: null, finishedAt: null, ...p,
})

describe('排隊', () => {
  it('前面還有幾個人＝順位減 1', () => expect(queueText(3)).toBe('前面還有 2 個人'))
  it('第 1 位：下一個就輪到你', () => expect(queueText(1)).toBe('下一個就輪到你'))
})
describe('交通查詢等候', () => {
  it('有秒數就寫約幾秒（無條件進位）', () => expect(quotaText(12.2)).toBe('交通資料查詢中，約 13 秒'))
  it('沒有秒數就不寫', () => expect(quotaText(null)).toBe('交通資料查詢中，請稍等'))
})
describe('漏斗上方那一行（也是螢幕閱讀器念的）', () => {
  it('還沒連上', () => expect(funnelHeadline(undefined)).toBe('正在送出條件…'))
  it('排隊中', () => expect(funnelHeadline(run({ status: 'queued', position: 2 }))).toBe('排隊中，前面還有 1 個人'))
  it('等交通查詢', () => expect(funnelHeadline(run({ stage: 'routing', waitingQuota: true, waitSeconds: 5 }))).toBe('交通資料查詢中，約 5 秒'))
  it('一般階段念階段名稱', () => expect(funnelHeadline(run({ stage: 'filtering' }))).toBe('篩出每一段都接得上的組合…'))
  it('多想一下的階段併進「挑出最適合你的 3 個」', () => expect(funnelHeadline(run({ stage: 'llm_fallback' }))).toBe('挑出最適合你的 3 個…'))
  it('完成', () => expect(funnelHeadline(run({ status: 'done' }))).toBe('每一段都檢查完了'))
  it('排不出來', () => expect(funnelHeadline(run({ status: 'failed' }))).toBe('這組條件排不出來'))
})
```

- [ ] **Step 2：跑測試確認失敗**

- [ ] **Step 3：實作** `funnelCopy.ts`

```ts
import type { Run } from '@/api/planRuns'
import { STAGES, stageIndex } from './stages'

export const queueText = (position: number) => (position <= 1 ? '下一個就輪到你' : `前面還有 ${position - 1} 個人`)

export const quotaText = (seconds: number | null) =>
  seconds != null && seconds > 0 ? `交通資料查詢中，約 ${Math.ceil(seconds)} 秒` : '交通資料查詢中，請稍等'

/** 漏斗上方的一行字；aria-live 只念這一行（規格 4.3） */
export function funnelHeadline(run: Run | undefined): string {
  if (!run || run.status === 'connecting') return '正在送出條件…'
  if (run.status === 'queued') return `排隊中，${queueText(run.position ?? 1)}`
  if (run.status === 'done') return '每一段都檢查完了'
  if (run.status === 'failed') return '這組條件排不出來'
  if (run.waitingQuota) return quotaText(run.waitSeconds)
  return `${STAGES[stageIndex(run.stage)]?.label ?? '處理中'}…`
}
```

`planRuns.ts`：`waiting_quota` 事件 `patch(key, { status: 'running', waitingQuota: true, waitSeconds: e.data.wait_seconds ?? null })`；其他階段 `waitSeconds: null`。

- [ ] **Step 4：跑測試確認通過**（PASS 11 個）

- [ ] **Step 5：`PlanFunnel.tsx`**（取代 `PlanProgress.tsx`，保留它的行為：結果到了停 800ms 再 `onDone`、系統錯誤立刻交棒、已等時間、取消、離開會取消的說明）

畫面（由上到下）：
1. `LogoMark`（跑完就停）＋`funnelHeadline(run)`，放在 `<p role="status" aria-live="polite">`；**只有這一行在 live region 裡**，數字和清單不在。
2. 大數字（`zg-num`，Archivo）：`run.feasible ?? run.combinations`，用 Motion `animate` 跳過去（`useReducedMotion()` 時直接顯示）。下面一行小字照舊（「種組合檢查中」／「種每段都接得上（共 N 種組合）」）。
3. 漏斗：`<ol aria-label="規劃進度">`，7 列照 `STAGES`；第 i 列寬度 `calc(100% - i * 8%)`、置中，形成往下收窄的漏斗。做完的列：`bg-[var(--zg-glow)]` 底、左邊 `Check`；正在做：邊框 `border-[var(--zg-flow)]`＋轉圈（`motion-reduce:animate-none`）；還沒到：`opacity-60`。`filtering` 那列下面照舊列五道關卡（`gateLabels`），做完一起打勾。
4. 跑完（`run.status === 'done'`）：漏斗底下出現三個亮點（每個方案一個，`size-3 rounded-full bg-[var(--zg-flow)] shadow-[0_0_12px_var(--zg-glow)]`），各自 `style={{ viewTransitionName: \`zg-plan-${p.rank}\` }}`，旁邊 `sr-only`「找到 3 個方案」。
5. 沒跑完時：已等時間、「取消規劃」、「離開這一頁會取消規劃。」照舊。

`index.css` 加：

```css
/* 漏斗的三個亮點飛成三張方案卡（規格 4.2，React Router viewTransition） */
::view-transition-group(*) {
  animation-duration: 0.6s;
  animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none;
  }
}
```

- [ ] **Step 6：流程測試**（加在 `result.e2e.ts`；漏斗裡一閃而過的字用 `e2e/seen.ts`）

```ts
test('漏斗：排隊人數、階段一道道亮、念目前階段', async ({ page }) => {
  // seen.ts 的用法照 home.e2e.ts / flows.e2e.ts
  // 期待看過：「排隊中，前面還有 1 個人」「排隊中，下一個就輪到你」「篩出每一段都接得上的組合…」
  // 期待 role=status 的元素在跑的時候內容有變、跑完是「每一段都檢查完了」，最後到 /p/編號
})
test('減少動態：跑完直接到結果頁，沒有轉場動畫也不會卡住', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // 送出 → 期待 /p/編號 和「選擇方案」出現
})
```

- [ ] **Step 7：全套檢查、Commit**

```bash
git add frontend/src/features/result/funnelCopy.ts frontend/src/features/result/funnelCopy.test.ts frontend/src/features/result/PlanFunnel.tsx frontend/src/features/result/ResultPage.tsx frontend/src/api/planRuns.ts frontend/src/index.css frontend/e2e/result.e2e.ts
git rm frontend/src/features/result/PlanProgress.tsx
git commit -m "feat(frontend): 排程中改成真進度漏斗：排隊人數、交通查詢秒數、只念目前階段，跑完三個亮點飛成方案卡

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4：錶盤模型和瓶頸 `dialModel.ts`

**Files:**
- Create：`frontend/src/features/result/dial/dialModel.ts`、`frontend/src/features/result/dial/dialModel.test.ts`

**Interfaces:**
- Consumes：`stepSpans(plan)`（`shared/lib/steps.ts`）、`bufferSentence`、`bufferLevel`（`shared/lib/buffer.ts`）、`clock`（`shared/lib/time.ts`）
- Produces：
  - `DIAL_START = -150`、`DIAL_SPAN = 300`
  - `angleAt(iso: string, departAt: string, homeAt: string): number`（度，0＝12 點鐘、順時針為正；超出範圍夾在兩端）
  - `type DialSegment = { index: number; type: TimelineStep['type']; a0: number; a1: number; start: string; end: string }`
  - `dialSegments(plan: Plan): DialSegment[]`（長度 0 的步驟不畫，例如 `home`）
  - `dialTicks(plan: Plan): { angle: number; label: string }[]`（出門和到家之間每個整點，`label` 例如 `"18:00"`，台灣時間）
  - `polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number }`
  - `arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string`
  - `type Bottleneck = { index: number; minutes: number; gate: BufferGate; window: ReturnWindow | null; walkHome: boolean; angle: number }`
  - `bottleneck(plan: Plan): Bottleneck | null`
  - `bottleneckCopy(b: Bottleneck, stationName: string): { title: string; consequence: string }`

- [ ] **Step 1：寫失敗的測試** `dialModel.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { Plan } from '@/api/schemas'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { angleAt, arcPath, bottleneck, bottleneckCopy, DIAL_SPAN, DIAL_START, dialSegments, dialTicks, polar } from './dialModel'

const base = mockResult(benchmarkRequest, false).plans[0]
const T = (hm: string) => `2026-11-08T${hm}:00+08:00`
/** 手做的簡單方案：17:00 出門、22:00 到家，五個小時剛好 300 度＝每小時 60 度 */
const simple: Plan = {
  ...base,
  depart_at: T('17:00'),
  home_at: T('22:00'),
  min_buffer_minutes: 8,
  timeline: [
    { type: 'transit', from: '中壢', to: '桃園', summary: '區間車', depart_at: T('17:00'), arrive_at: T('18:00'), fare_per_person: 30 },
    { type: 'walk', minutes: 30, arrive_at: T('18:30'), buffer_minutes: 8, buffer_gate: 'showtime' },
    { type: 'movie', starts_at: T('18:30'), ends_at: T('20:30') },
    { type: 'meal', starts_at: T('20:30'), ends_at: T('21:00'), duration: 'normal', buffer_minutes: 20, buffer_gate: 'last_order' },
    { type: 'transit', from: '桃園', to: '中壢', summary: '區間車', depart_at: T('21:00'), arrive_at: T('22:00'), fare_per_person: 30, buffer_minutes: 8, buffer_gate: 'return_trip' },
    { type: 'home', station: '中壢', arrive_at: T('22:00') },
  ],
}

describe('角度', () => {
  it('出門在 -150 度、到家在 +150 度', () => {
    expect(angleAt(T('17:00'), simple.depart_at, simple.home_at)).toBe(DIAL_START)
    expect(angleAt(T('22:00'), simple.depart_at, simple.home_at)).toBe(DIAL_START + DIAL_SPAN)
  })
  it('中間照時間比例：19:30 是正上方 0 度', () => expect(angleAt(T('19:30'), simple.depart_at, simple.home_at)).toBe(0))
  it('超出範圍夾在兩端', () => expect(angleAt(T('23:00'), simple.depart_at, simple.home_at)).toBe(150))
})

describe('每一段的弧', () => {
  it('照時間軸順序、頭尾相接、不畫長度 0 的到家', () => {
    const s = dialSegments(simple)
    expect(s.map((x) => x.type)).toEqual(['transit', 'walk', 'movie', 'meal', 'transit'])
    expect(s[0].a0).toBe(-150)
    expect(s[2]).toMatchObject({ a0: -60, a1: 60 })
    expect(s.at(-1)!.a1).toBe(150)
  })
  it('假資料的真方案也頭尾落在範圍內、一路往前', () => {
    const s = dialSegments(base)
    s.forEach((x) => {
      expect(x.a0).toBeGreaterThanOrEqual(DIAL_START)
      expect(x.a1).toBeLessThanOrEqual(DIAL_START + DIAL_SPAN)
      expect(x.a1).toBeGreaterThanOrEqual(x.a0)
    })
  })
})

describe('刻度', () => {
  it('出門和到家之間的整點（不含頭尾）', () =>
    expect(dialTicks(simple)).toEqual([
      { angle: -90, label: '18:00' },
      { angle: -30, label: '19:00' },
      { angle: 30, label: '20:00' },
      { angle: 90, label: '21:00' },
    ]))
})

describe('SVG 幾何', () => {
  it('0 度在正上方、90 度在右邊', () => {
    expect(polar(100, 100, 50, 0)).toEqual({ x: 100, y: 50 })
    const r = polar(100, 100, 50, 90)
    expect(r.x).toBeCloseTo(150)
    expect(r.y).toBeCloseTo(100)
  })
  it('超過 180 度的弧要用大弧旗標', () => {
    expect(arcPath(100, 100, 50, -150, 150)).toContain(' 0 1 1 ')
    expect(arcPath(100, 100, 50, 0, 90)).toContain(' 0 0 1 ')
  })
})

describe('瓶頸', () => {
  it('挑緩衝最小的一步；一樣小取最前面', () => {
    const b = bottleneck(simple)!
    expect(b).toMatchObject({ index: 1, minutes: 8, gate: 'showtime' })
    expect(b.angle).toBe(-60) // 那一步結束在 18:30：出門後 1.5 小時＝-150＋90
  })
  it('沒有任何緩衝資料就回 null', () => expect(bottleneck({ ...simple, timeline: simple.timeline.map(({ buffer_minutes: _b, buffer_gate: _g, ...s }) => s) as Plan['timeline'] })).toBeNull())
  it('假資料的方案：瓶頸分鐘數就是 min_buffer_minutes', () => expect(bottleneck(base)?.minutes).toBe(base.min_buffer_minutes))
})

describe('瓶頸的後果文案', () => {
  const b = (gate: 'showtime' | 'last_order' | 'return_trip' | 'latest_return', extra = {}) => ({ index: 0, minutes: 8, gate, window: null, walkHome: false, angle: 0, ...extra })
  it('開演', () => expect(bottleneckCopy(b('showtime'), '中壢站')).toEqual({ title: '開演前只剩 8 分', consequence: '這一段只要再慢超過 8 分鐘，就趕不上電影開演。' }))
  it('點餐', () => expect(bottleneckCopy(b('last_order'), '中壢站').consequence).toBe('這一段只要再慢超過 8 分鐘，餐廳就不能點餐了。'))
  it('回程車：有備案時說幾點前還有車', () =>
    expect(bottleneckCopy(b('return_trip', { window: { planned_depart_at: T('21:00'), minutes_to_planned: 8, latest_depart_at: T('21:40'), minutes_to_latest: 48 } }), '中壢站').consequence).toBe(
      '趕不上預定那班車的話，21:40 前還有車，只是會比較晚到家。',
    ))
  it('回程車：沒有備案', () => expect(bottleneckCopy(b('return_trip'), '中壢站').consequence).toBe('這一段只要再慢超過 8 分鐘，就趕不上預定那班回程車。'))
  it('回程整段走路', () => expect(bottleneckCopy(b('return_trip', { walkHome: true }), '中壢站').consequence).toBe('這一段只要再慢超過 8 分鐘，就沒辦法在你設的時間前走回中壢站。'))
  it('最晚到家', () => expect(bottleneckCopy(b('latest_return'), '中壢站')).toEqual({ title: '比最晚回到中壢站只早 8 分', consequence: '再慢超過 8 分鐘，就可能趕不上末班車、超過你設的最晚到家時間。' }))
})
```

- [ ] **Step 2：跑測試確認失敗**

- [ ] **Step 3：實作** `dialModel.ts`

```ts
import type { BufferGate, Plan, ReturnWindow, TimelineStep } from '@/api/schemas'
import { bufferSentence } from '@/shared/lib/buffer'
import { stepSpans } from '@/shared/lib/steps'
import { clock } from '@/shared/lib/time'

/*
 * 結果頁的錶盤（規格 4.4）：出門到到家畫成一段 300 度的弧，從左下（-150 度）順時針到右下（+150 度），底下留缺口。
 * 角度 0＝12 點鐘、順時針為正。純函式，畫面（PlanDial）只負責畫。
 */
export const DIAL_START = -150
export const DIAL_SPAN = 300

export function angleAt(iso: string, departAt: string, homeAt: string): number {
  const t0 = Date.parse(departAt)
  const total = Date.parse(homeAt) - t0
  const f = total > 0 ? (Date.parse(iso) - t0) / total : 0
  return DIAL_START + DIAL_SPAN * Math.min(1, Math.max(0, f))
}

export type DialSegment = { index: number; type: TimelineStep['type']; a0: number; a1: number; start: string; end: string }

export function dialSegments(plan: Plan): DialSegment[] {
  return stepSpans(plan).flatMap((s, index) => {
    const a0 = angleAt(s.start, plan.depart_at, plan.home_at)
    const a1 = angleAt(s.end, plan.depart_at, plan.home_at)
    return a1 > a0 ? [{ index, type: s.type, a0, a1, start: s.start, end: s.end }] : []
  })
}

const HOUR = 3_600_000
export function dialTicks(plan: Plan): { angle: number; label: string }[] {
  const t0 = Date.parse(plan.depart_at)
  const t1 = Date.parse(plan.home_at)
  const ticks: { angle: number; label: string }[] = []
  // 台灣沒有日光節約時間，整點＝UTC 整點
  for (let t = Math.floor(t0 / HOUR) * HOUR + HOUR; t < t1; t += HOUR) {
    const iso = new Date(t).toISOString()
    ticks.push({ angle: angleAt(iso, plan.depart_at, plan.home_at), label: clock(iso) })
  }
  return ticks
}

export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p0 = polar(cx, cy, r, a0)
  const p1 = polar(cx, cy, r, a1)
  const large = a1 - a0 > 180 ? 1 : 0
  const f = (n: number) => Math.round(n * 100) / 100
  return `M ${f(p0.x)} ${f(p0.y)} A ${r} ${r} 0 ${large} 1 ${f(p1.x)} ${f(p1.y)}`
}

export type Bottleneck = { index: number; minutes: number; gate: BufferGate; window: ReturnWindow | null; walkHome: boolean; angle: number }

/** 最緊的一段：buffer_minutes 最小的一步（一樣小取最前面）；聚光燈打在那一步結束的地方 */
export function bottleneck(plan: Plan): Bottleneck | null {
  const spans = stepSpans(plan)
  let best: Bottleneck | null = null
  for (const [index, s] of plan.timeline.entries()) {
    if (s.buffer_minutes == null || !s.buffer_gate) continue
    if (best && s.buffer_minutes >= best.minutes) continue
    best = {
      index,
      minutes: s.buffer_minutes,
      gate: s.buffer_gate,
      window: s.return_window ?? null,
      walkHome: !plan.timeline.slice(index + 1).some((x) => x.type === 'transit'),
      angle: angleAt(spans[index].end, plan.depart_at, plan.home_at),
    }
  }
  return best
}

const later = (m: number) => `這一段只要再慢超過 ${m} 分鐘，`

export function bottleneckCopy(b: Bottleneck, stationName: string): { title: string; consequence: string } {
  const m = b.minutes
  switch (b.gate) {
    case 'showtime':
      return { title: `開演前只剩 ${m} 分`, consequence: `${later(m)}就趕不上電影開演。` }
    case 'last_order':
      return { title: `離最後點餐只剩 ${m} 分`, consequence: `${later(m)}餐廳就不能點餐了。` }
    case 'return_trip':
      return {
        title: bufferSentence('return_trip', m, stationName, b.window, b.walkHome),
        consequence: b.window
          ? `趕不上預定那班車的話，${clock(b.window.latest_depart_at)} 前還有車，只是會比較晚到家。`
          : b.walkHome
            ? `${later(m)}就沒辦法在你設的時間前走回${stationName}。`
            : `${later(m)}就趕不上預定那班回程車。`,
      }
    case 'latest_return':
      return { title: `比最晚回到${stationName}只早 ${m} 分`, consequence: `再慢超過 ${m} 分鐘，就可能趕不上末班車、超過你設的最晚到家時間。` }
  }
}
```

- [ ] **Step 4：跑測試確認通過**（Expected：PASS；如果假資料方案 `base` 的 `bottleneck` 和 `min_buffer_minutes` 對不上，先看 `mocks/planResult.ts` 的 `buffers` 有沒有把 `home` 那步的緩衝算進 `min_buffer_minutes`；以後端規格為準：`min_buffer_minutes` 是所有 `buffer_minutes` 的最小值，假資料不一致就修假資料，不改測試）

- [ ] **Step 5：Commit**

```bash
git add frontend/src/features/result/dial/dialModel.ts frontend/src/features/result/dial/dialModel.test.ts
git commit -m "feat(frontend): 錶盤的角度、刻度、每段弧線和瓶頸文案（純函式）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5：錶盤＋瓶頸聚光燈 `PlanDial`、三方案滑動切換

**Files:**
- Create：`frontend/src/features/result/dial/PlanDial.tsx`
- Modify：`frontend/src/features/result/PlanSwitcher.tsx`、`frontend/src/features/result/PlanPage.tsx`、`frontend/e2e/result.e2e.ts`

**Interfaces:**
- Consumes：Task 4 全部；`bufferLevel`、`LEVEL_LABEL`；`clockOn`
- Produces：
  - `PlanDial({ plan, date, stationName, onPrev, onNext }: { plan: Plan; date: string; stationName: string; onPrev?: () => void; onNext?: () => void })`
  - `PlanSwitcher` 多了：方案卡的 `viewTransitionName = zg-plan-{rank}`；`radiogroup` 支援 ←／→（roving tabindex：只有選中的那張 `tabIndex=0`）

- [ ] **Step 1：`PlanDial.tsx`**

- 外框 `<figure>`，`<figcaption className="sr-only">` 寫：「這個方案 {出門} 出門、{到家} 到家，共 {N} 段；最緊的是：{title}」。
- SVG `viewBox="0 0 320 320"`、`aria-hidden="true"`、`className="mx-auto w-full max-w-[20rem]"`。圓心 (160,160)、半徑 120、線寬 16。
  - 底圈：`arcPath(160,160,120,DIAL_START,DIAL_START+DIAL_SPAN)`，`stroke="var(--border)"`、`fill="none"`。
  - 刻度：`dialTicks(plan)` 每個在半徑 104～112 畫一條短線，半徑 92 寫 `label`（`font-family: var(--zg-num-font)`、10px、`fill="var(--muted-foreground)"`）。
  - 每段：`dialSegments(plan)`，`fill="none"`、`strokeLinecap="butt"`；顏色：`transit` 和 `walk` 都是 `var(--zg-flow)`（`walk` 加 `strokeDasharray="4 4"`）、`movie` `var(--foreground)`、`meal` `var(--muted-foreground)`、`wait` `var(--border)`。用 Motion 的 `motion.path` `initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}`，`transition={{ delay: i * 0.08, duration: 0.4 }}`；`useReducedMotion()` 時 `initial={false}`。
  - 聚光燈：`bottleneck(plan)` 有值時，在 `polar(160,160,120,b.angle)` 畫一個半徑 22 的圓，`fill` 用 `radialGradient`（中心 `var(--zg-{level})` 不透明度 0.55 → 外圈 0），上面一個半徑 7 的實心點（同色），外加 `motion.circle` 呼吸（scale 1→1.25→1，2.4 秒，無限次；減少動態時不動）。
  - 中央：`出門` 小字＋`clockOn(depart_at)` 大字（Archivo、`zg-num`、28px），`到家` 小字＋`clockOn(home_at)`。
- 聚光燈的按鈕：SVG 外面疊一個 `<button>`，用 `polar` 算出的 x、y 換成百分比 `left: x/320*100%`、`top: y/320*100%`，`-translate-x-1/2 -translate-y-1/2 size-11 rounded-full`（觸控目標 44px），`aria-expanded`、`aria-controls="dial-bottleneck"`、`aria-label={\`最緊的一段：${title}，看會怎樣\`}`。點了切換下面的說明。
- 說明區 `id="dial-bottleneck"`：標題 `title`（顏色用 `text-zg-{level}`）＋`consequence`＋「緩衝 {LEVEL_LABEL[level]}」小字。**預設展開**（第一眼就看得到最緊的一段），按鈕可以收起。
- 圖例：錶盤下面一排小字，「搭車／走路／電影／用餐／候位」各配一個色塊，只列這個方案有出現的類型。
- 滑動：`<figure>` 上 `onPointerDown` 記起點、`onPointerUp` 算位移；`|dx| > 48 && |dx| > |dy|` 時 `dx < 0 ? onNext?.() : onPrev?.()`。加 `style={{ touchAction: 'pan-y' }}`，直向捲動不受影響。

- [ ] **Step 2：`PlanSwitcher.tsx`**

- 每張卡 `style={{ ..., viewTransitionName: \`zg-plan-${p.rank}\` }}`（跟漏斗最後的三個亮點同名）。
- 鍵盤：`radiogroup` 的 `onKeyDown`：`ArrowRight`／`ArrowDown` 選下一個、`ArrowLeft`／`ArrowUp` 選上一個（到底繞回），選完把焦點移到新選的卡；只有選中的卡 `tabIndex={0}`，其他 `-1`。
- 手機可左右滑的捲動列照舊（原生捲動就是「滑動」）；換方案後把選中的卡 `scrollIntoView({ inline: 'nearest', block: 'nearest' })`。

- [ ] **Step 3：放進 `PlanView`**

順序（規格 3.2 第 4 步）：`ConditionBar` → 標題「這 N 個行程，每一段都接得上。」→ `PlanSwitcher` → **`PlanDial`**（`onPrev`／`onNext` 換方案）→ 時間軸區塊（`highlight.reason`、換過的提示、`Timeline`）＋右欄（地圖、花費、Task 6 的動作）。電腦版錶盤和時間軸並排：`lg:grid-cols-[20rem_1fr]`，左欄錶盤 `lg:sticky`。

- [ ] **Step 4：流程測試**（`result.e2e.ts`）

```ts
test('錶盤：一打開就看到最緊的一段和後果，按聚光燈可以收起', async ({ page }) => {
  // 走到 /p/編號
  const spot = page.getByRole('button', { name: /最緊的一段/ })
  await expect(spot).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#dial-bottleneck')).toContainText(/只要再慢超過|還有車/)
  await spot.click()
  await expect(spot).toHaveAttribute('aria-expanded', 'false')
})
test('方案用鍵盤 ←／→ 切換，網址跟著換', async ({ page }) => {
  await page.getByRole('radio', { checked: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/plan=2/)
  await expect(page.getByRole('radio', { checked: true })).toBeFocused()
})
test('手機在錶盤上左滑換到下一個方案', async ({ page }) => {
  // 只在 iphone 專案跑（test.skip(!isMobile)）；用 page.mouse 從錶盤右邊拖到左邊 120px
  await expect(page).toHaveURL(/plan=2/)
})
```

- [ ] **Step 5：全套檢查、Commit**

```bash
git add frontend/src/features/result/dial/PlanDial.tsx frontend/src/features/result/PlanSwitcher.tsx frontend/src/features/result/PlanPage.tsx frontend/e2e/result.e2e.ts
git commit -m "feat(frontend): 結果頁錶盤＋瓶頸聚光燈，三個方案可以用 ←／→ 和左右滑切換

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6：分享、加到行事曆、改條件重排 `PlanActions`

**Files:**
- Create：`frontend/src/shared/lib/ics.ts`、`frontend/src/shared/lib/ics.test.ts`、`frontend/src/shared/lib/clipboard.ts`、`frontend/src/features/result/PlanActions.tsx`
- Modify：`frontend/src/features/result/CopyButton.tsx`（改用 `clipboard.ts`）、`frontend/src/features/result/planPath.ts`（加 `shareUrl`）、`planPath.test.ts`、`frontend/src/features/result/PlanPage.tsx`、`frontend/e2e/result.e2e.ts`

**Interfaces:**
- Produces：
  - `icsFor({ plan, jobId, request, url, stationName, now }: { plan: Plan; jobId: string; request: PlanRequest; url: string; stationName: string; now: Date }): string`
  - `icsDate(iso: string): string`（`20261108T090000Z`）、`icsEscape(s: string): string`、`foldLine(line: string): string`
  - `writeClipboard(text: string): Promise<boolean>`（從 `CopyButton.tsx` 原樣搬出）
  - `shareUrl(origin: string, base: string, id: string, rank: number): string` → `${origin}${base}p/${id}`（`base` 是 `import.meta.env.BASE_URL`，結尾有 `/`），`rank !== 1` 加 `?plan=`；**不帶** `mock`
  - `PlanActions({ doc, plan, swapped, stationName })`

- [ ] **Step 1：寫失敗的測試** `ics.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { foldLine, icsDate, icsEscape, icsFor } from './ics'

const plan = mockResult(benchmarkRequest, false, 'c'.repeat(32)).plans[0]
const text = icsFor({ plan, jobId: 'c'.repeat(32), request: benchmarkRequest, url: 'https://example.test/p/ccc', stationName: '中壢站', now: new Date('2026-11-08T02:00:00Z') })
const unfolded = text.replace(/\r\n /g, '')

describe('行事曆檔（.ics）', () => {
  it('時間換成 UTC', () => expect(icsDate('2026-11-08T17:05:00+08:00')).toBe('20261108T090500Z'))
  it('逗號、分號、反斜線、換行要跳脫', () => expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne'))
  it('每行用 CRLF，最外層是 VCALENDAR，只有一個 VEVENT', () => {
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
  })
  it('出門到到家、編號＋方案當 UID、帶連結', () => {
    expect(unfolded).toContain(`DTSTART:${icsDate(plan.depart_at)}`)
    expect(unfolded).toContain(`DTEND:${icsDate(plan.home_at)}`)
    expect(unfolded).toContain(`UID:${'c'.repeat(32)}-${plan.rank}@zerogap`)
    expect(unfolded).toContain('URL:https://example.test/p/ccc')
    expect(unfolded).toContain(`SUMMARY:電影《${plan.movie.title}》＋晚餐`)
  })
  it('每行不超過 75 個位元組，中文不會被切成半個字', () => {
    const enc = new TextEncoder()
    text.split('\r\n').forEach((l) => expect(enc.encode(l).length).toBeLessThanOrEqual(75))
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(enc.encode(unfolded))).not.toThrow()
  })
  it('折行：續行開頭一個空白', () => {
    const long = `DESCRIPTION:${'行'.repeat(40)}`
    const folded = foldLine(long)
    expect(folded.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })
})
```

`planPath.test.ts` 加：

```ts
it('分享網址：完整網址、不帶 mock', () => {
  expect(shareUrl('https://x.github.io', '/ZeroGap/', 'd'.repeat(32), 1)).toBe(`https://x.github.io/ZeroGap/p/${'d'.repeat(32)}`)
  expect(shareUrl('http://localhost:5173', '/', 'd'.repeat(32), 2)).toBe(`http://localhost:5173/p/${'d'.repeat(32)}?plan=2`)
})
```

- [ ] **Step 2：跑測試確認失敗**

- [ ] **Step 3：實作** `ics.ts`

```ts
import type { Plan, PlanRequest } from '@/api/schemas'
import { describeTimeline } from './steps'

/*
 * 「加到行事曆」（規格 3.2 第 4 步）：在瀏覽器裡產生 .ics（RFC 5545），不經過後端。
 * 一個事件：出門到到家；說明欄放逐段時間軸和行程連結。
 */
export const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const enc = new TextEncoder()
/** 超過 75 個位元組就折行，續行開頭一個空白；只在完整的字之間切，中文不會被切壞 */
export function foldLine(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    const limit = out.length === 0 ? 75 : 74
    if (bytes + n > limit) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

export function icsFor({ plan, jobId, request, url, stationName, now }: { plan: Plan; jobId: string; request: PlanRequest; url: string; stationName: string; now: Date }): string {
  const steps = describeTimeline(plan, request.date)
  const desc = [...steps.map((s) => `${s.time} ${s.title}：${s.desc}`), '', `行程連結：${url}`].join('\n')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ZeroGap//Plan//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${jobId}-${plan.rank}@zerogap`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(plan.depart_at)}`,
    `DTEND:${icsDate(plan.home_at)}`,
    `SUMMARY:${icsEscape(`電影《${plan.movie.title}》＋晚餐`)}`,
    `LOCATION:${icsEscape(plan.movie.cinema)}`,
    `DESCRIPTION:${icsEscape(`從${stationName}出發\n${desc}`)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
```

`clipboard.ts`：把 `CopyButton.tsx` 的 `writeClipboard` 原樣搬過來 `export`，`CopyButton` 改成 import。

`planPath.ts` 加：

```ts
export function shareUrl(origin: string, base: string, id: string, rank: number): string {
  return `${origin}${base}p/${id}${rank !== 1 ? `?plan=${rank}` : ''}`
}
```

- [ ] **Step 4：跑測試確認通過**

- [ ] **Step 5：`PlanActions.tsx`**

三個主要按鈕（`h-11`，手機直排、電腦一排），用 shadcn 的 `Button`（`@/components/ui/button`，跟地基那批一樣）：
1. **分享連結**：`url = shareUrl(location.origin, import.meta.env.BASE_URL, doc.job_id, plan.rank)`。觸控裝置（`matchMedia('(pointer: coarse)')`）而且有 `navigator.share` → `navigator.share({ title: 'ZeroGap 行程', text: \`電影《${plan.movie.title}》＋晚餐，${clockOn(plan.depart_at)} 出門\`, url })`（使用者按取消，`AbortError` 不算錯）；否則 `writeClipboard(url)`，成功顯示「已複製連結」2 秒（`aria-live="polite"`），失敗顯示一個唯讀輸入框讓人手動複製。
2. **加到行事曆**：`new Blob([icsFor(...)], { type: 'text/calendar;charset=utf-8' })` → `URL.createObjectURL` → 暫時的 `<a download="zerogap-行程.ics">` 點一下 → `revokeObjectURL`。
3. **改條件重排**：`usePlanStore.getState().replaceRequest(doc.request)` 再 `navigate('/plan/1')`，用這份行程的條件打開四步精靈，改完按「排出行程」就會重排。（只想改一兩項的人，用頁面頂端的條件列 `ConditionBar`，Task 2 已經接成「改完直接到 `/result` 重排」。）

按鈕下面的提醒（有才顯示，`text-xs text-muted-foreground`）：
- `doc.request.origin_lat != null` → 「這個連結含有你出發的大概位置（約 100 公尺內），只傳給信任的人。」
- `USE_MOCK || useDemoStore.getState().demo` → 「展示版：這個連結只在這台瀏覽器打得開。」

原本的「複製行程」（文字版）留著，放在三個按鈕下面當次要按鈕；手機底部固定列改成放「分享連結」。

- [ ] **Step 6：流程測試**（`result.e2e.ts`）

```ts
test('分享：電腦複製出 /p/編號 的完整網址', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', '剪貼簿權限只在 chromium 測')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: '分享連結' }).click()
  await expect(page.getByText('已複製連結')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/p\/[0-9a-f]{32}$/)
})
test('加到行事曆：下載 .ics', async ({ page }) => {
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: '加到行事曆' }).click()
  expect((await dl).suggestedFilename()).toMatch(/\.ics$/)
})
test('從目前位置出發的行程，分享旁邊提醒位置', async ({ page }) => {
  // 照 flows.e2e.ts 既有的「目前位置」寫法（先 grant geolocation、等 zg-plan 存好 origin_lat）
  await expect(page.getByText(/含有你出發的大概位置/)).toBeVisible()
})
```

- [ ] **Step 7：全套檢查、Commit**

```bash
git add frontend/src/shared/lib/ics.ts frontend/src/shared/lib/ics.test.ts frontend/src/shared/lib/clipboard.ts frontend/src/features/result/CopyButton.tsx frontend/src/features/result/PlanActions.tsx frontend/src/features/result/planPath.ts frontend/src/features/result/planPath.test.ts frontend/src/features/result/PlanPage.tsx frontend/e2e/result.e2e.ts
git commit -m "feat(frontend): 結果頁可以分享連結、加到行事曆、改條件重排；含位置的連結會提醒

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7：分享頁的狀態列＋「這個方案怎麼來的」

**Files:**
- Create：`frontend/src/features/result/PlanHeader.tsx`、`frontend/src/features/result/HowItWasMade.tsx`、`frontend/src/features/result/HowItWasMade.test.tsx`
- Modify：`frontend/src/features/result/PlanPage.tsx`、`frontend/e2e/result.e2e.ts`

**Interfaces:**
- Consumes：`shareStatus`、`SavedPlan`、`rerunPath`、`stamp`（`shared/lib/time.ts`）、`useStatus`
- Produces：
  - `PlanHeader({ doc, now }: { doc: SavedPlan; now: Date })`：一行說明＋過期時的橫幅
  - `PlanMissing()`：找不到這份行程
  - `HowItWasMade({ plan, stats, plansCount, date }: { plan: Plan; stats: { combinations: number; feasible: number }; plansCount: number; date: string })`

- [ ] **Step 1：寫失敗的測試** `HowItWasMade.test.tsx`（照 `NoSolution.test.tsx` 用 `renderToStaticMarkup`；`useStatus` 用 `QueryClientProvider` 包一個空的 `QueryClient`）

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { HowItWasMade } from './HowItWasMade'

const result = mockResult(benchmarkRequest, true)
const html = (rank: number) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <HowItWasMade plan={result.plans.find((p) => p.rank === rank)!} stats={result.stats} plansCount={result.plans.length} date={benchmarkRequest.date} />
    </QueryClientProvider>,
  )

describe('這個方案怎麼來的', () => {
  it('用這次的真數字：全部組合 → 接得上 → 給你幾個', () => {
    const h = html(1)
    expect(h).toContain(result.stats.combinations.toLocaleString())
    expect(h).toContain(result.stats.feasible.toLocaleString())
    expect(h).toContain(`挑出 ${result.plans.length} 個`)
  })
  it('有備選就列出來（拿不定的情境第 1 案有電影和餐廳備選）', () => {
    const p1 = result.plans.find((p) => p.rank === 1)!
    const h = html(1)
    p1.alternatives.movie?.forEach((a) => expect(h).toContain(a.title))
  })
  it('不出現 AI、Jev、LLM、機率', () => {
    for (const rank of result.plans.map((p) => p.rank)) expect(html(rank)).not.toMatch(/AI|Jev|LLM|機率/i)
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

- [ ] **Step 3：實作**

`HowItWasMade.tsx`：`<details className="zg-surface p-4">`，`<summary>` 「這個方案怎麼來的」。內容：
1. 三格數字（Archivo）：`{combinations}` 種組合 → `{feasible}` 種每段都接得上 → 挑出 `{plansCount}` 個；一句「每一種組合都檢查過開演、點餐、走路、回程車和預算五道關卡」。
2. `plan.highlight?.reason`（有才顯示）。
3. 「其他也排得進去的選擇」：`alternatives.movie` 每個「《title》，{clockOn(home_at)} 到家」、`alternatives.restaurant` 用 `restaurantName(name, cuisineLabel(cuisine))`、`route_go`／`route_return` 用 `summary＋clockOn(depart_at)`；全部沒有就寫「這個方案沒有其他接得上的備選」。
4. 資料時間：重用 `FreshnessNote`（把它放進來，頁面底部那份拿掉）。

`PlanHeader.tsx`：
- 一行：「這份行程在 {stamp(created_at)} 排好，班次已確認。」（`stamp` 輸出 `11/08 21:03`）
- `shareStatus(doc, now) === 'expired'`：`role="alert"` 橫幅「這份行程已經過期」＋說明（每個方案都出發過了，或超過 7 天）＋按鈕「用同樣條件重排」→ `navigate(rerunPath(doc.request, location.search), { state: { replay: true } })`。日期已經過了的話，`/result` 本來就會先問要換哪天（`StaleDate`），不用另外處理。
- 過期時下面的行程照樣顯示（看得到當初排了什麼），但 `PlanActions` 的「分享連結」「加到行事曆」改成 `disabled`，旁邊寫「行程過期了，先重排再分享」。

`PlanMissing`（取代 Task 2 的暫時版）：`<h1>`「找不到這份行程，可能已經超過 7 天」、說明「分享連結保留 7 天。可以用自己的條件重新排一次。」、按鈕「回首頁排行程」→ `/`。

`PlanPage` 的 `now`：`const [now] = useState(() => new Date())`（一進頁面算一次就好）。

- [ ] **Step 4：跑測試確認通過**

- [ ] **Step 5：流程測試**（固定時鐘）

```ts
test('過期的行程：顯示過期、可以用同樣條件重排', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
  // 送出 → /p/編號；記下網址
  await page.clock.setFixedTime(new Date('2026-11-09T10:00:00+08:00')) // 隔天，每個方案都出發過了
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('這份行程已經過期')
  await page.getByRole('button', { name: '用同樣條件重排' }).click()
  await expect(page).toHaveURL(/\/result\?/)
})
test('排好時間那一行', async ({ page }) => {
  await expect(page.getByText(/這份行程在 \d{2}\/\d{2} \d{2}:\d{2} 排好，班次已確認/)).toBeVisible()
})
test('這個方案怎麼來的：展開看得到真數字和備選', async ({ page }) => {
  await page.goto('/?mock=low_confidence') // 或直接開 /result?…&mock=low_confidence
  // 送出 → /p/編號
  await page.getByText('這個方案怎麼來的').click()
  await expect(page.getByText(/種每段都接得上/)).toBeVisible()
})
```

- [ ] **Step 6：全套檢查、Commit**

```bash
git add frontend/src/features/result/PlanHeader.tsx frontend/src/features/result/HowItWasMade.tsx frontend/src/features/result/HowItWasMade.test.tsx frontend/src/features/result/PlanPage.tsx frontend/e2e/result.e2e.ts
git commit -m "feat(frontend): 分享頁寫出排好的時間、過期和找不到的說明；每個方案可以展開看怎麼來的

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8：地圖畫真實路線、查餐廳位置、捲到附近才載入

**Files:**
- Create：`frontend/src/features/result/map/routeCache.ts`、`frontend/src/features/result/map/routeCache.test.ts`、`frontend/src/features/result/map/legs.ts`、`frontend/src/features/result/map/legs.test.ts`
- Modify：`frontend/src/features/result/map/route.ts`（＋`route.test.ts`）、`GoogleRoute.tsx`、`RouteMap.tsx`、`frontend/src/features/result/PlanPage.tsx`（傳 `jobId`）、`frontend/e2e/result.e2e.ts`

**Interfaces:**
- Consumes：`RouteNode`、`routeNodes`、`useMapStore`、主題的 `useThemeStore`＋`resolveTheme`（`shared/theme/theme.ts`）
- Produces：
  - `route.ts`：`RouteNode` 多一個 `line: string | null`（`via === 'train'` 時是那段交通的 `summary`，例如「區間車」；其他 `null`）
  - `legs.ts`：`type Leg = { i: number; from: RouteNode; to: RouteNode; mode: 'walk' | 'train'; label: string | null }`、`routeLegs(nodes: RouteNode[]): Leg[]`、`midpoint(a: LatLng, b: LatLng): LatLng`
  - `routeCache.ts`：`type LatLng = { lat: number; lng: number }`、`CACHE_KEY = 'zg-route-cache'`、`CACHE_TTL_MS = 7 * 86_400_000`、`readCache<T>(key: string, now?: number): T | null`、`writeCache(key: string, value: unknown, now?: number): void`、`walkKey(jobId: string, rank: number, leg: number)`、`placeKey(placeId: string)`；最多 200 筆，舊的先丟
  - `RouteMap({ plan, date, jobId })`

- [ ] **Step 1：寫失敗的測試** `routeCache.test.ts`、`legs.test.ts`、`route.test.ts` 加一條

```ts
// routeCache.test.ts（localStorage 用跟 Task 1 一樣的 Map 假物件）
it('存了拿得回來', () => { writeCache(walkKey('e'.repeat(32), 1, 0), [{ lat: 1, lng: 2 }], 0); expect(readCache(walkKey('e'.repeat(32), 1, 0), 1)).toEqual([{ lat: 1, lng: 2 }]) })
it('7 天後丟掉', () => { writeCache('k', 1, 0); expect(readCache('k', CACHE_TTL_MS + 1)).toBeNull() })
it('最多 200 筆', () => { for (let i = 0; i < 201; i++) writeCache(`k${i}`, i, i); expect(readCache('k0', 300)).toBeNull(); expect(readCache('k200', 300)).toBe(200) })
it('存的東西壞掉回 null', () => { mem.set(CACHE_KEY, '壞'); expect(readCache('k', 0)).toBeNull() })
it('鍵：路線用分享編號＋方案＋第幾段，地點用 place_id', () => { expect(walkKey('ab', 2, 3)).toBe('walk:ab:2:3'); expect(placeKey('ChIJx')).toBe('place:ChIJx') })

// legs.test.ts
it('相鄰兩站一段，搭車段帶車種', () => {
  const nodes = routeNodes(mockResult(benchmarkRequest, false).plans[0], benchmarkRequest.date)
  const legs = routeLegs(nodes)
  expect(legs).toHaveLength(nodes.length - 1)
  legs.forEach((l, i) => { expect(l.from).toBe(nodes[i]); expect(l.to).toBe(nodes[i + 1]); expect(l.mode).toBe(nodes[i + 1].via === 'train' ? 'train' : 'walk') })
  expect(legs.filter((l) => l.mode === 'train').every((l) => l.label)).toBe(true)
})
it('中點', () => expect(midpoint({ lat: 0, lng: 0 }, { lat: 2, lng: 4 })).toEqual({ lat: 1, lng: 2 }))

// route.test.ts
it('搭車到的那一站記下車種', () => {
  const nodes = routeNodes(mockResult(benchmarkRequest, false).plans[0], benchmarkRequest.date)
  nodes.forEach((n) => expect(n.line != null).toBe(n.via === 'train'))
})
```

- [ ] **Step 2：跑測試確認失敗**

- [ ] **Step 3：實作純函式**

```ts
// routeCache.ts
/*
 * 地圖查過的路線和餐廳位置存在這台瀏覽器（規格 5「省錢」）：同一份行程不重複查。
 * 7 天後丟掉（跟分享連結一樣長，也在 Google 准許暫存座標的 30 天內）；最多 200 筆。
 */
export type LatLng = { lat: number; lng: number }
export const CACHE_KEY = 'zg-route-cache'
export const CACHE_TTL_MS = 7 * 86_400_000
const KEEP = 200
type Entry = { v: unknown; t: number }

function load(): Record<string, Entry> {
  try {
    const o = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as unknown
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, Entry>) : {}
  } catch {
    return {}
  }
}

export function readCache<T>(key: string, now = Date.now()): T | null {
  const e = load()[key]
  return e && now - e.t <= CACHE_TTL_MS ? (e.v as T) : null
}

export function writeCache(key: string, value: unknown, now = Date.now()): void {
  const all = { ...load(), [key]: { v: value, t: now } }
  const kept = Object.entries(all).filter(([, e]) => now - e.t <= CACHE_TTL_MS).sort(([, a], [, b]) => b.t - a.t).slice(0, KEEP)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // 存不進去就每次重查，地圖照樣能用
  }
}

export const walkKey = (jobId: string, rank: number, leg: number) => `walk:${jobId}:${rank}:${leg}`
export const placeKey = (placeId: string) => `place:${placeId}`
```

```ts
// legs.ts
import type { LatLng } from './routeCache'
import type { RouteNode } from './route'

export type Leg = { i: number; from: RouteNode; to: RouteNode; mode: 'walk' | 'train'; label: string | null }

export const routeLegs = (nodes: RouteNode[]): Leg[] =>
  nodes.slice(1).map((to, i) => ({ i, from: nodes[i], to, mode: to.via === 'train' ? 'train' : 'walk', label: to.line }))

export const midpoint = (a: LatLng, b: LatLng): LatLng => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 })
```

`route.ts`：`routeNodes` 建新站時多 `line: steps[i - 1]?.type === 'transit' ? (plan.timeline[i - 1] as Extract<TimelineStep, { type: 'transit' }>).summary : null`（`describeTimeline` 和 `plan.timeline` 的索引一樣）。

- [ ] **Step 4：跑測試確認通過**

- [ ] **Step 5：地圖元件**

`GoogleRoute.tsx`（新增的 props：`jobId: string`、`plan.rank` 已經有；`nodes` 可能有幾站沒座標）：
1. **餐廳位置**：`useMapsLibrary('places')`；沒座標但有 `place.place_id` 的站，先 `readCache<LatLng>(placeKey(id))`，沒有才 `const p = new places.Place({ id }); await p.fetchFields({ fields: ['location'] })`，`p.location` 轉成 `{ lat: p.location.lat(), lng: p.location.lng() }`，`writeCache`。全部站都有座標前顯示「地圖載入中…」；查不到（丟錯或 `location` 是空的）就呼叫新的 `onUnavailable('這家餐廳的位置查不到，先用路線示意圖。')`。
2. **走路段**：`useMapsLibrary('routes')`；每個 `mode === 'walk'` 的段，先 `readCache<LatLng[]>(walkKey(jobId, rank, leg.i))`，沒有才
   ```ts
   const { routes } = await routesLib.Route.computeRoutes({ origin: from, destination: to, travelMode: 'WALKING', fields: ['path'] })
   const path = routes?.[0]?.path?.map((p) => ({ lat: p.lat, lng: p.lng })) ?? null
   ```
   （`path` 的元素型別以 `@types/google.maps` 的 `LatLngAltitude` 為準：`lat`、`lng` 是屬性不是方法；如果型別定義不同，照型別改，寫進 commit 說明。）拿到就 `writeCache`；拿不到（丟錯、沒結果、`routes` 函式庫不存在）這一段改畫直線虛線，**不**整張地圖退回示意圖。
3. **搭車段**：起訖站之間畫實線（`var(--zg-flow)` 解析後的顏色，見 4），中點放一個小標籤 `AdvancedMarker`：`<span className="rounded-full bg-background/90 px-2 py-0.5 text-[11px] shadow">{leg.label}</span>`。說明文字從「站和站之間是直線示意」改成「走路是實際步行路線；搭車畫起訖站，照我們排的班次」。
4. **配色跟主題**：`const theme = resolveTheme(useThemeStore((s) => s.pref), systemDark)`（用 `theme.ts` 已有的 hook，照首頁 `DotField` 的寫法），`<Map colorScheme={theme === 'night' ? 'DARK' : 'LIGHT'} …>`（`@vis.gl/react-google-maps` 1.10.1 的 `colorScheme` prop，型別以套件為準；`colorScheme` 只在掛上時生效，所以 `<Map key={theme}>`）。線的顏色用 `getComputedStyle(document.documentElement).getPropertyValue('--zg-flow')` 讀出來，主題換了重畫。
5. 標記照舊用編號圓點，`selected` 的反白。

`RouteMap.tsx`：
- props 多 `jobId`。
- **捲到附近才載入**：外層 `div` 掛 `IntersectionObserver`（`rootMargin: '300px'`），還沒進到附近前顯示跟地圖同高（`h-72`）的佔位「地圖會在捲到這裡時載入」，進來後才渲染 `GoogleRoute`（`lazy` 照舊）。
- `fallback` 的原因加上 `onUnavailable` 傳上來的文字；`hasCoords` 的判斷改成「每一站有座標**或**有 `place_id`」（有 `place_id` 的交給 Places 查）。
- 「在 Google 地圖查看完整路線」和每一站的「在 Google 地圖開啟這一站」照舊（`maps.ts`，不用金鑰）。

- [ ] **Step 6：流程測試**（沒有金鑰的環境只能測退路和延遲載入）

```ts
test('地圖：沒有金鑰時說明原因、仍有完整路線連結；捲到附近才出現', async ({ page }) => {
  // 走到 /p/編號（e2e 環境沒有 VITE_GOOGLE_MAPS_KEY）
  const map = page.getByTestId('route-map')
  await map.scrollIntoViewIfNeeded()
  await expect(map.getByText('這個網站目前沒有開啟 Google 地圖，先用路線示意圖。')).toBeVisible()
  await expect(map.getByRole('link', { name: '在 Google 地圖查看完整路線' })).toHaveAttribute('href', /google\.com\/maps/)
})
```

（有金鑰時的畫線行為這一批**驗不到**：等使用者申請到金鑰後，用 `npm run dev` 手動看；寫進導讀和 PR 說明。）

- [ ] **Step 7：全套檢查、Commit**

```bash
git add frontend/src/features/result/map frontend/src/features/result/PlanPage.tsx frontend/e2e/result.e2e.ts
git commit -m "feat(frontend): 地圖畫真的步行路線、搭車段標車種、查 Google 餐廳位置；查過的存 7 天，捲到附近才載入

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9：收尾：無障礙、效能、文件

**Files:**
- Modify：`frontend/e2e/a11y.e2e.ts`、`frontend/README.md`、`docs/superpowers/specs/2026-11-07-frontend-redesign-design.md`（第 11 節第 4 批標 ✅、第 9 節「暫留」把 `?exp=1` 那句改成已拿掉）、這份計畫的進度表
- Create：`frontend/docs/導讀_11_結果頁.md`

- [ ] **Step 1：axe**：`a11y.e2e.ts` 加 `/p/編號`（日、夜兩個主題都掃，夜的用 `localStorage zg-theme` 設 `night` 再 reload，照 `foundation.e2e.ts` 的寫法）和排程中的漏斗畫面（用 `?mock=pending` 停在漏斗），零嚴重問題。地基那批留下的「夜間掃 `?exp=1` 元件」那件事，因為 `?exp=1` 拿掉了，改成這兩頁的夜間掃描，算是結案。
- [ ] **Step 2：效能**：`npm run perf`，首頁慢速 4G LCP 仍 < 2.0 秒（這批不該動到首頁的包；`/p/:id` 是延遲載入）。數字寫進導讀。
- [ ] **Step 3：`導讀_11_結果頁.md`**（白話，給組員看）：
  - 新流程一張圖（文字版）：首頁四格 → `/result` 漏斗 → 換到 `/p/編號` → 結果頁；分享和 MCP 連結開的是同一頁。
  - 錶盤怎麼看：一圈是出門到到家、顏色代表什麼、聚光燈是哪一段、點了會說什麼。
  - 分享頁的三種狀態（正常、過期、找不到）和 7 天的規則；目前位置的提醒；展示版只在同一台瀏覽器打得開。
  - 地圖：走路用 Google 路線、搭車照我們的班次；要開哪些 API（Maps JavaScript API、Routes API、Places API (New)）；2026-11-07 查的價目（Dynamic Maps 每月 10,000 次免費、超過每千次 US$7；Compute Routes Essentials 10,000／US$5；Place Details Essentials 10,000／US$5），以及我們怎麼省（存 7 天、捲到附近才載入）；沒金鑰時的樣子。
  - `?exp=1` 拿掉了，舊網址會怎樣（參數被忽略，看到新畫面）。
  - 測試數字（單元、流程、LCP）。
- [ ] **Step 4：README** 的頁面清單加 `/p/:id`，拿掉 `?exp=1` 的說明。
- [ ] **Step 5：全套檢查、Commit**

```bash
git add frontend/e2e/a11y.e2e.ts frontend/README.md "frontend/docs/導讀_11_結果頁.md" docs/superpowers/specs/2026-11-07-frontend-redesign-design.md docs/superpowers/plans/2026-11-08-frontend-batch4-result.md
git commit -m "docs(frontend): 導讀 11 結果頁；結果頁和漏斗的無障礙掃描（日、夜）；規格和 README 更新

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10：推分支、開 PR（不合併）

- [ ] 確認作者 email 都是公開的那個：`git log feat/home-quick..HEAD --format='%ae %ce' | sort -u`（不能出現舊的私人 email）。
- [ ] `git push -u origin feat/result-page`
- [ ] `gh pr create --repo RyanWu9863/ZeroGap --base feat/home-quick --head feat/result-page`，標題「前端第 4 批：結果頁（漏斗、錶盤、分享頁、真實路線）」；說明寫：做了什麼、含 #4 的一個 commit、需要後端 #5 才能在真後端打開分享連結（假資料模式不用）、有金鑰時的地圖還沒驗、測試數字；結尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
- [ ] **不合併。**

## 進度表

| Task | 狀態 |
|---|---|
| 1 分享資料層 | |
| 2 `/result` → `/p/:id`、拿掉 `?exp=1` | |
| 3 真進度漏斗 | |
| 4 錶盤模型 | |
| 5 錶盤＋聚光燈＋滑動切換 | |
| 6 分享、行事曆、重排 | |
| 7 狀態列＋怎麼來的 | |
| 8 地圖真實路線 | |
| 9 收尾 | |
| 10 PR | |
