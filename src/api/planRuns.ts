import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PlanError, postPlan } from './client'
import type { PlanRequest, PlanResult, Stage } from './schemas'

/*
 * 規劃的「叫號機」。一次規劃要 2～3 分鐘，結果後端也不保存（規格書 6.5、6.7），所以：
 * - 同一時間只跑一個規劃（後端每個 IP 只准一個），換條件就先取消舊的
 * - 結果存在瀏覽器，重新整理直接顯示，不重跑（決策 Q62）
 * - 畫面離開就取消；等 1.5 秒再取消，避免 React 開發模式「掛上→拆掉→再掛上」誤殺
 * 不用 TanStack Query：它會在畫面拆掉的瞬間取消，也不會把結果存進瀏覽器。
 */

export type RunError = { code: string; message: string; reasons: Record<string, number> | null; retryAfter: number | null; status: number | null }

export type Run = {
  status: 'connecting' | 'queued' | 'running' | 'done' | 'failed'
  startedAt: number
  /** 排隊順位（queued 事件） */
  position: number | null
  /** 目前階段；waiting_quota 不算階段，另外用 waitingQuota 表示 */
  stage: Exclude<Stage, 'waiting_quota'> | null
  waitingQuota: boolean
  combinations: number | null
  feasible: number | null
  result: PlanResult | null
  error: RunError | null
  finishedAt: number | null
}

/** 同一組條件 → 同一把鑰匙 */
export const requestKey = (r: PlanRequest) => JSON.stringify(r)

/** 這兩種失敗是「條件本身排不出來」，重新整理也一樣，可以存起來 */
const DETERMINISTIC = ['NO_FEASIBLE', 'NO_SHOWTIMES']
const KEEP = 6
/**
 * 存起來的「排不出來」只算 10 分鐘：場次、餐廳每天更新，交通查不到的結果後端也只快取 10 分鐘（規格書 5.3），
 * 過了就重新規劃，不要一直卡在舊的無解。排出來的結果照 Q62 一直留著。
 */
const FAILURE_TTL = 10 * 60_000
const expiredAt = (r: Run | undefined, now: number) => r?.status === 'failed' && r.finishedAt != null && now - r.finishedAt > FAILURE_TTL

type Store = { runs: Record<string, Run>; lastDoneKey: string | null }

export const usePlanRunStore = create<Store>()(
  persist((): Store => ({ runs: {}, lastDoneKey: null }), {
    name: 'zg-plan-runs',
    // version 2：結果格式改成 v0.13（餐廳多了 hours_verified 等欄位），舊版存的結果直接丟掉
    version: 2,
    migrate: () => ({ runs: {}, lastDoneKey: null }),
    // 只存跑完的；最多留最近 6 組
    partialize: (s) => ({
      lastDoneKey: s.lastDoneKey,
      runs: Object.fromEntries(
        Object.entries(s.runs)
          .filter(([, r]) => r.status === 'done' || (r.status === 'failed' && DETERMINISTIC.includes(r.error?.code ?? '')))
          .sort(([, a], [, b]) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
          .slice(0, KEEP),
      ),
    }),
  }),
)

const blank = (): Run => ({ status: 'connecting', startedAt: Date.now(), position: null, stage: null, waitingQuota: false, combinations: null, feasible: null, result: null, error: null, finishedAt: null })

const patch = (key: string, p: Partial<Run>) =>
  usePlanRunStore.setState((s) => (s.runs[key] ? { runs: { ...s.runs, [key]: { ...s.runs[key], ...p } } } : s))

const drop = (key: string) =>
  usePlanRunStore.setState((s) => {
    const { [key]: _gone, ...rest } = s.runs
    return { runs: rest }
  })

const live = new Map<string, AbortController>()
/** 被取消的規劃把自己的進度清掉；同一組條件已經重新開始的話，不要清到新的 */
const dropIfMine = (key: string, ctrl: AbortController) => {
  if (!live.has(key) || live.get(key) === ctrl) drop(key)
}
const watchers = new Map<string, number>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function toRunError(e: unknown): RunError {
  if (e instanceof PlanError) return { code: e.code, message: e.message, reasons: e.reasons, retryAfter: e.retryAfter, status: e.status }
  return { code: 'NETWORK', message: e instanceof Error ? e.message : String(e), reasons: null, retryAfter: null, status: null }
}

async function execute(key: string, req: PlanRequest, ctrl: AbortController) {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await postPlan(req, {
        signal: ctrl.signal,
        onEvent: (e) => {
          if (e.type === 'queued') patch(key, { status: 'queued', position: e.data.position })
          else if (e.data.stage === 'waiting_quota') patch(key, { status: 'running', waitingQuota: true })
          else {
            const p: Partial<Run> = { status: 'running', stage: e.data.stage, waitingQuota: false, position: null }
            if (e.data.combinations != null) p.combinations = e.data.combinations
            if (e.data.feasible != null) p.feasible = e.data.feasible
            patch(key, p)
          }
        },
      })
      patch(key, { status: 'done', result, finishedAt: Date.now() })
      usePlanRunStore.setState({ lastDoneKey: key })
      return
    } catch (e) {
      if (ctrl.signal.aborted) return dropIfMine(key, ctrl)
      // 409：上一個規劃（剛取消的那個）後端還沒放掉，等一下再試
      if (e instanceof PlanError && e.code === 'PLAN_IN_PROGRESS' && attempt < 3) {
        await wait(2000)
        if (ctrl.signal.aborted) return dropIfMine(key, ctrl)
        continue
      }
      patch(key, { status: 'failed', error: toRunError(e), finishedAt: Date.now() })
      return
    } finally {
      if (live.get(key) === ctrl && (ctrl.signal.aborted || usePlanRunStore.getState().runs[key]?.finishedAt)) live.delete(key)
    }
  }
}

/** 開始一個新的規劃；其他還在跑的一律取消（後端每個 IP 同時只能一個） */
export function startPlan(req: PlanRequest) {
  const key = requestKey(req)
  for (const [k, c] of live) {
    if (k === key) continue
    c.abort()
    live.delete(k)
  }
  live.get(key)?.abort()
  const ctrl = new AbortController()
  live.set(key, ctrl)
  usePlanRunStore.setState((s) => ({ runs: { ...s.runs, [key]: blank() } }))
  void execute(key, req, ctrl)
}

/** 有人在看這組條件：取消「待取消」 */
function watch(key: string) {
  watchers.set(key, (watchers.get(key) ?? 0) + 1)
  clearTimeout(timers.get(key))
  timers.delete(key)
}

/** 沒人看了：1.5 秒後取消（中間又有人來看就不取消） */
function unwatch(key: string) {
  const n = (watchers.get(key) ?? 1) - 1
  watchers.set(key, n)
  if (n > 0 || !live.has(key)) return
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      if ((watchers.get(key) ?? 0) > 0) return
      live.get(key)?.abort()
      live.delete(key)
    }, 1500),
  )
}

/**
 * 結果頁用：拿到這組條件的規劃狀態；沒有就開始規劃。
 * fresh＝從精靈按「排出行程」進來，不用瀏覽器裡的舊結果，重新規劃一次。
 */
export function usePlanRun(req: PlanRequest, fresh = false) {
  const key = requestKey(req)
  const stored = usePlanRunStore((s) => s.runs[key])
  // fresh 時，掛上之前就跑完的舊結果不算數：第一個畫面才不會先閃出舊結果、再跳回等待畫面
  // 存太久的「排不出來」也一樣不算數，會重新規劃
  const [since] = useState(() => Date.now())
  const old = stored?.finishedAt != null && stored.finishedAt < since
  const run = old && (fresh || expiredAt(stored, since)) ? undefined : stored
  useEffect(() => {
    const existing = usePlanRunStore.getState().runs[key]
    const finished = existing?.status === 'done' || existing?.status === 'failed'
    const redo = finished && (fresh || expiredAt(existing, Date.now()))
    if (!live.has(key) && (!existing || redo || !finished)) startPlan(req)
    watch(key)
    return () => unwatch(key)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- 只在條件改變時處理一次
  return { run, retry: () => startPlan(req) }
}

/** 取消目前這組（等待畫面的「取消規劃」） */
export function cancelPlan(req: PlanRequest) {
  const key = requestKey(req)
  live.get(key)?.abort()
  live.delete(key)
}

/** 最近一次成功的規劃（系統幕後用） */
export function useLastResult(): { request: PlanRequest; result: PlanResult } | null {
  const last = usePlanRunStore((s) => (s.lastDoneKey ? s.runs[s.lastDoneKey] : undefined))
  const key = usePlanRunStore((s) => s.lastDoneKey)
  if (!key || !last?.result) return null
  return { request: JSON.parse(key) as PlanRequest, result: last.result }
}
