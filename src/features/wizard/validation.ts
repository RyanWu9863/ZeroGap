import type { ItineraryRequest } from '@/api/schemas'
import { MIN_COMFORT_HOURS } from '@/shared/lib/config'
import { isPastDate } from '@/shared/lib/dates'

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

/**
 * 檢查日期用的背景資訊（P0-1）：今天、可選日。不給就只檢查「有沒有填」。
 * 由呼叫的地方傳入，讓這裡維持純函式。
 */
export type DateContext = { today?: string; available?: readonly string[] }

/** 日期可以用嗎？：有填、不是過去、（有清單時）在可選日裡 */
export function dateUsable(date: string, ctx: DateContext = {}): boolean {
  if (!date) return false
  if (ctx.today && isPastDate(date, ctx.today)) return false
  if (ctx.available && !ctx.available.includes(date)) return false
  return true
}

/** 這一步填完了沒？沒填完「下一步」不能按 */
export function stepComplete(n: number, r: ItineraryRequest, ctx: DateContext = {}): boolean {
  switch (n) {
    case 1:
      return Boolean(r.district_hub && r.origin_station)
    case 2:
      return dateUsable(r.date, ctx) && toMinutes(r.latest_return) > toMinutes(r.earliest_departure)
    case 3:
      return Boolean(r.movie_title)
    case 4:
      return r.budget_per_person > 0 && r.max_walk_minutes > 0
    default:
      return false
  }
}

/** 第一個還沒填完的步驟；全部填完回傳 null */
export function firstIncomplete(r: ItineraryRequest, ctx: DateContext = {}): number | null {
  return STEPS.find((s) => !stepComplete(s.n, r, ctx))?.n ?? null
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
