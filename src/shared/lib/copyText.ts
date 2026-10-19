import type { ItineraryRequest, Proposal } from '@/api/schemas'
import { formatDate, formatMoney, stationLabel } from './format'
import { routeUrl } from './maps'

/**
 * 「複製行程」的文字（決策 Q61）：貼到 LINE 對方就能用。
 * 格式：日期標題 → 每行一個時刻 → 每人花費 → Google 地圖路線 → 署名。
 */
export function itineraryToText(req: ItineraryRequest, plan: Proposal): string {
  const header = `📅 ${formatDate(req.date)} ${req.district_hub}行程`
  const lines = plan.timeline_steps.map((s) => `${s.time} ${s.desc}`)
  const hasEstimate = Object.values(plan.cost_breakdown).some((c) => c.is_estimated)
  const cost = `每人約 ${formatMoney(plan.summary.total_cost_per_person)}${hasEstimate ? '（含估計值）' : ''}`
  const places = plan.timeline_steps.flatMap((s) => (s.place ? [s.place] : []))
  const map = places.length >= 2 ? `路線：${routeUrl(places)}` : null
  const back = `${plan.summary.return_time} 回到${stationLabel(req.origin_station)}`
  return [header, '', ...lines, '', back, cost, map, '— 由 ZeroGap 零空檔排程'].filter((l) => l !== null).join('\n')
}
