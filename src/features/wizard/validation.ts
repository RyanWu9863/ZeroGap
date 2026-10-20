import type { PlanRequest } from '@/api/schemas'
import { MIN_COMFORT_HOURS } from '@/shared/lib/config'
import { taipeiNow } from '@/shared/lib/time'

/** 四步精靈（Q13、Q17）：對應專題簡介的四組條件 */
export const STEPS = [
  { n: 1, label: '地點' },
  { n: 2, label: '時間' },
  { n: 3, label: '娛樂' },
  { n: 4, label: '餐飲與預算' },
] as const

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export const toHHMM = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** 最晚回到站可以跨到隔天凌晨 02:00（規格書 6.4）：凌晨 06:00 以前都當成隔天 */
const NEXT_DAY_BEFORE = 6 * 60
export const homeMinutes = (hhmm: string) => {
  const m = toMinutes(hhmm)
  return m < NEXT_DAY_BEFORE ? m + 24 * 60 : m
}

/** "01:30" → 「隔天 01:30」；"23:00" → 「23:00」 */
export const homeLabel = (hhmm: string) => (toMinutes(hhmm) < NEXT_DAY_BEFORE ? `隔天 ${hhmm}` : hhmm)

/** 選了今天，出門時間要晚於現在（規格書 6.4） */
export function departureInPast(r: PlanRequest, now = taipeiNow()): boolean {
  return r.date === now.date && toMinutes(r.earliest_departure) <= now.minutes
}

/** 這一步填完了沒？沒填完「下一步」不能按 */
export function stepComplete(n: number, r: PlanRequest): boolean {
  switch (n) {
    case 1:
      return Boolean(r.area && r.origin_station_id > 0)
    case 2:
      return Boolean(r.date) && minutesAvailable(r) > 0 && !departureInPast(r)
    case 3:
      return true // 「幫我挑」也算選好了
    case 4:
      return r.budget_per_person > 0 && r.max_walk_minutes > 0
    default:
      return false
  }
}

/** 第一個還沒填完的步驟；全部填完回傳 null */
export function firstIncomplete(r: PlanRequest): number | null {
  return STEPS.find((s) => !stepComplete(s.n, r))?.n ?? null
}

/** 出門到回到站有幾分鐘 */
export const minutesAvailable = (r: PlanRequest) => homeMinutes(r.latest_home) - toMinutes(r.earliest_departure)

/** 「6 小時」「2 小時 15 分」 */
export function durationLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 小時 ${m} 分` : `${h} 小時`
}

/** 時間太短就柔性提醒（Q70），但不擋送出 */
export const tooTight = (r: PlanRequest) => minutesAvailable(r) < MIN_COMFORT_HOURS * 60
