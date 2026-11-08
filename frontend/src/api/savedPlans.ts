import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getSavedPlan, PlanError } from './client'
import { ApiError } from './errors'
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
    let request: PlanRequest
    try {
      request = JSON.parse(key) as PlanRequest
    } catch {
      continue // 壞掉的紀錄跳過，不要讓整頁掛掉
    }
    return {
      job_id: id,
      request,
      result: run.result,
      created_at: new Date(run.finishedAt).toISOString(),
      expires_at: new Date(run.finishedAt + TTL_MS).toISOString(),
    }
  }
  return null
}

/**
 * 分享連結傳出去打不打得開：後端存不進去時（Redis 太滿或出錯）SSE 的結果帶 saved: false，
 * 這台瀏覽器還看得到 /p/:id，傳出去的卻會 404（規格書 6.8，v0.23）
 */
export const canShare = (doc: SavedPlan) => doc.result.saved !== false

/** 過期＝超過保留期限，或每個方案的出發時間都過了（規格 3.3） */
export function shareStatus(doc: SavedPlan, now: Date): 'ok' | 'expired' {
  const t = now.getTime()
  if (t >= Date.parse(doc.expires_at)) return 'expired'
  return doc.result.plans.every((p) => Date.parse(p.depart_at) <= t) ? 'expired' : 'ok'
}

export function useSavedPlan(id: string) {
  const valid = JOB_ID_RE.test(id)
  const runs = usePlanRunStore((s) => s.runs)
  const local = useMemo(() => (valid ? localSavedPlan(runs, id) : null), [valid, runs, id])
  const q = useQuery({
    queryKey: ['saved-plan', id],
    queryFn: ({ signal }) => getSavedPlan(id, signal),
    enabled: valid && !local,
    staleTime: Infinity,
    // 404 不重試；連不上、等太久照 TanStack Query 預設重試
    // 格式不對再試也一樣，不重試
    retry: (n, e) => !(e instanceof PlanError && e.code === 'NOT_FOUND') && !(e instanceof ApiError && e.kind === 'format') && n < 2,
  })
  const notFound = !valid || (q.error instanceof PlanError && q.error.code === 'NOT_FOUND')
  const doc = local ?? q.data ?? null
  const state = doc ? 'found' : notFound ? 'not_found' : q.isError && !q.isFetching ? 'error' : 'loading'
  return { state, doc, error: q.error, retry: () => void q.refetch() } as const
}
