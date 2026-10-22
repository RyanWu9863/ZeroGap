import type { Plan, PlanRequest } from '@/api/schemas'
import { formatDate, formatMoney } from './format'
import { routeUrl } from './maps'
import { describeTimeline, placeName, timelinePlaces } from './steps'
import { clockOn } from './time'

/** 換過電影或餐廳時（D2）要多寫的一行：換成什麼、估計幾點回到站、每人多少 */
export type CopySwap = { name: string; alsoRestaurant: string | null; homeAt: string; total: number }

/**
 * 「複製行程」的文字（決策 Q61）：貼到 LINE 對方就能用。
 * 格式：日期標題 → 每行一個時刻 → 回到站、每人花費 → 換過的估計 → Google 地圖路線 → 資料出處 → 署名。
 * 標題用商圈名稱，車站名稱由呼叫的人查好傳進來（請求裡只有代碼和 id）。
 */
export function itineraryToText(req: PlanRequest, plan: Plan, names: { area: string; station: string }, swap: CopySwap | null = null): string {
  const header = `📅 ${formatDate(req.date)} ${names.area}行程`
  const lines = describeTimeline(plan, req.date).map((s) =>
    s.type === 'movie' || s.type === 'meal' || s.type === 'wait' ? `${s.time} ${s.title}：${s.desc}` : `${s.time} ${s.desc}`,
  )
  const hasEstimate = plan.estimated.length > 0
  const cost = `每人${hasEstimate ? '約 ' : ' '}${formatMoney(plan.cost_per_person.total)}${hasEstimate ? '（含估計值）' : ''}`
  const back = `${clockOn(plan.home_at, req.date)} 回到${names.station}`
  const swapped = swap
    ? `※ 改選${swap.name}${swap.alsoRestaurant ? `（餐廳換成${swap.alsoRestaurant}）` : ''}：約 ${clockOn(swap.homeAt, req.date)} 回到站、每人約 ${formatMoney(swap.total)}（時間軸是原本的，這兩項是估計）`
    : null
  // 目前位置不放進地圖連結：貼出去的文字不帶座標（2026-10-21 使用者決定）
  const places = timelinePlaces(plan)
    .filter((p) => p.kind !== 'location')
    .map((p) => ({ ...p, name: placeName(p) }))
  const map = places.length >= 2 ? `路線：${routeUrl(places)}` : null
  const credit = plan.restaurant.source === 'google' ? '餐廳資料：Google Maps' : plan.restaurant.source === 'osm' ? '餐廳資料：© OpenStreetMap 貢獻者（ODbL）' : null
  return [header, '', ...lines, '', back, cost, swapped, map, credit, '— 由 ZeroGap 零空檔排程'].filter((l) => l !== null).join('\n')
}
