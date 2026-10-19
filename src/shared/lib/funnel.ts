import type { ItineraryResponse } from '@/api/schemas'
import type { ItineraryRequest } from '@/api/schemas'
import { gateLabels } from './gates'

export type FunnelStage = { label: string; tech: string; remaining: number; eliminated: number }

/**
 * 漏斗資料（Q65、Q67）：全部組合 → 每過一關還剩幾組。
 * 後端沒給每關剔除數（提案 #7）時回傳 null，畫面只顯示「全部 → 接得上」。
 */
export function funnelStages(req: ItineraryRequest, data: ItineraryResponse): FunnelStage[] | null {
  const by = data.funnel_stats.by_filter
  if (!by) return null
  const labels = gateLabels(req)
  let remaining = data.funnel_stats.total_checked
  return by.map((f) => {
    remaining -= f.eliminated
    return { label: labels.find((g) => g.id === f.id)?.label ?? f.name, tech: f.name, remaining, eliminated: f.eliminated }
  })
}
