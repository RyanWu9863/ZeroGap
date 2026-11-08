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
