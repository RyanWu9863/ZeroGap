import type { PlanRequest } from '@/api/schemas'
import { dateUsable, departureInPast, toMinutes, type DateContext } from '@/features/wizard/validation'
import { taipeiNow } from '@/shared/lib/time'
import { usesLocation } from '@/shared/lib/origin'

/*
 * 首頁四格快速條件（規格 3.2；2026-11-08 使用者決定四格：商圈、出發、日期、預算）。
 * 其他條件沿用 planStore 目前的值；想改就按「更多條件」進四步精靈。
 */
export type QuickField = 'area' | 'origin' | 'date' | 'budget'
type Ctx = DateContext & { today: string }

/** 今天的出發時間是否已經過了 */
function passedToday(date: string, departure: string, now: ReturnType<typeof taipeiNow>): boolean {
  return date === now.date && toMinutes(departure) <= now.minutes
}

/** 日期：可以用且（若是今天）出發時間沒過就不動；否則換最近可選日；一天都沒有回空字串 */
export function quickDate(current: string, ctx: Ctx, departure: string, now = taipeiNow()): string {
  if (dateUsable(current, ctx) && !passedToday(current, departure, now)) return current
  if (!ctx.available) return current
  const next = [...ctx.available]
    .sort()
    .find((d) => d >= ctx.today && dateUsable(d, ctx) && !passedToday(d, departure, now))
  return next ?? ''
}

/** 日期哪裡有問題：今天出發時間已過、日期不能用、或沒問題 */
export function dateIssue(r: PlanRequest, ctx: Ctx, now = taipeiNow()): 'past-departure' | 'unusable' | null {
  if (!dateUsable(r.date, ctx)) return 'unusable'
  return departureInPast(r, now) ? 'past-departure' : null
}

/** 還沒填好的格子（照畫面順序）。清單還沒載入時那一格先不檢查 */
export function quickMissing(r: PlanRequest, known: { areas?: string[]; stations?: number[] }, ctx: Ctx, now = taipeiNow()): QuickField[] {
  const out: QuickField[] = []
  if (known.areas && !known.areas.includes(r.area)) out.push('area')
  const originOk = usesLocation(r) || (known.stations ? known.stations.includes(r.origin_station_id ?? -1) : true)
  if (!originOk) out.push('origin')
  if (dateIssue(r, ctx, now)) out.push('date')
  if (!(r.budget_per_person > 0)) out.push('budget')
  return out
}
