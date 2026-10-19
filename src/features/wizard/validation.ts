import type { ItineraryRequest } from '@/api/schemas'
import { MIN_COMFORT_HOURS } from '@/shared/lib/config'

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

export const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** 這一步填完了沒？沒填完「下一步」不能按 */
export function stepComplete(n: number, r: ItineraryRequest): boolean {
  switch (n) {
    case 1:
      return Boolean(r.district_hub && r.origin_station)
    case 2:
      return Boolean(r.date) && toMinutes(r.latest_return) > toMinutes(r.earliest_departure)
    case 3:
      return Boolean(r.movie_title)
    case 4:
      return r.budget_per_person > 0 && r.max_walk_minutes > 0
    default:
      return false
  }
}

/** 第一個還沒填完的步驟；全部填完回傳 null */
export function firstIncomplete(r: ItineraryRequest): number | null {
  return STEPS.find((s) => !stepComplete(s.n, r))?.n ?? null
}

/** 出門到回到站有幾分鐘 */
export const minutesAvailable = (r: ItineraryRequest) => toMinutes(r.latest_return) - toMinutes(r.earliest_departure)

/** 「6 小時」「2 小時 15 分」 */
export function durationLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 小時 ${m} 分` : `${h} 小時`
}

/** 時間太短就柔性提醒（Q70），但不擋送出 */
export const tooTight = (r: ItineraryRequest) => minutesAvailable(r) < MIN_COMFORT_HOURS * 60
