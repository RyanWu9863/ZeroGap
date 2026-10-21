import type { PlanResult } from '@/api/schemas'

export type FunnelStage = { label: string; tech: string; remaining: number; eliminated: number }

/**
 * 漏斗資料（Q65、Q67）：全部組合 → 每段都接得上 → 給你的方案。
 * 後端只給 stats 的兩個數字，不給每道關卡剔除幾組（提案 #7 這一版不做），所以只有三層。
 */
export function funnelStages(result: PlanResult): FunnelStage[] {
  const { combinations, feasible } = result.stats
  const shown = result.plans.length
  return [
    { label: '每段都接得上', tech: '五道關卡（Python）', remaining: feasible, eliminated: combinations - feasible },
    { label: '給你的方案', tech: 'Jev 排序', remaining: shown, eliminated: feasible - shown },
  ]
}
