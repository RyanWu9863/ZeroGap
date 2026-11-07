import type { PlanRequest } from '@/api/schemas'
import { dateUsable, type DateContext } from '@/features/wizard/validation'
import { nearestAvailable } from '@/shared/lib/dates'
import { usesLocation } from '@/shared/lib/origin'

/*
 * 首頁四格快速條件（規格 3.2；2026-11-08 使用者決定四格：商圈、出發、日期、預算）。
 * 其他條件沿用 planStore 目前的值；想改就按「更多條件」進四步精靈。
 */
export type QuickField = 'area' | 'origin' | 'date' | 'budget'
type Ctx = DateContext & { today: string }

/** 日期：可以用就不動；過期或沒場次就換最近可選日；一天都沒有回空字串 */
export function quickDate(current: string, ctx: Ctx): string {
  if (dateUsable(current, ctx)) return current
  return ctx.available ? (nearestAvailable(ctx.available, ctx.today) ?? '') : current
}

/** 還沒填好的格子（照畫面順序）。清單還沒載入時那一格先不檢查 */
export function quickMissing(r: PlanRequest, known: { areas?: string[]; stations?: number[] }, ctx: Ctx): QuickField[] {
  const out: QuickField[] = []
  if (known.areas && !known.areas.includes(r.area)) out.push('area')
  const originOk = usesLocation(r) || (known.stations ? known.stations.includes(r.origin_station_id ?? -1) : true)
  if (!originOk) out.push('origin')
  if (!dateUsable(r.date, ctx)) out.push('date')
  if (!(r.budget_per_person > 0)) out.push('budget')
  return out
}
