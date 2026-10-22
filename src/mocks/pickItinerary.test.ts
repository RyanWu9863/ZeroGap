import { describe, expect, it } from 'vitest'
import { ItineraryResponse } from '@/api/schemas'
import { SCENARIOS } from '@/features/intro/scenarios'
import { itineraryOk } from './itineraryOk'
import { itineraryBudget, itineraryWeekend } from './itineraryScenarios'
import { fitsRequest, pickItinerary } from './pickItinerary'
import { benchmarkRequest } from './request'

const ALL = { 基準: itineraryOk, 週末午後: itineraryWeekend, 小資之夜: itineraryBudget }
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

describe('pickItinerary：情境卡的條件和假行程對得上', () => {
  it.each(SCENARIOS.map((s) => [s.title, s] as const))('%s', (_, s) => {
    const req = { ...benchmarkRequest, ...s.patch }
    expect(fitsRequest(pickItinerary(req), req)).toBe(true)
  })
  it('基準條件還是原本那組', () => {
    expect(pickItinerary(benchmarkRequest)).toBe(itineraryOk)
  })
  it('都對不上時退回基準那組', () => {
    expect(pickItinerary({ ...benchmarkRequest, earliest_departure: '20:00', latest_return: '21:00' })).toBe(itineraryOk)
  })
})

/* 假行程是手寫的，這裡檢查數字彼此一致，免得 Demo 時被看出破綻 */
describe.each(Object.entries(ALL))('假行程自身一致：%s', (_, data) => {
  it('通過 zod 驗貨', () => {
    expect(ItineraryResponse.safeParse(data).success).toBe(true)
  })
  it('漏斗：全部 − 每關剔除 ＝ 接得上的組數', () => {
    const f = data.funnel_stats
    expect(f.total_checked - f.by_filter!.reduce((n, x) => n + x.eliminated, 0)).toBe(f.feasible_count)
  })
  it.each(data.top_3_proposals.map((p) => [p.highlight?.label, p] as const))('方案「%s」', (_, p) => {
    const steps = p.timeline_steps
    const times = steps.map((s) => minutes(s.time))
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(p.summary.departure_time).toBe(steps[0].time)
    expect(p.summary.return_time).toBe(steps.at(-1)!.time)
    expect(Object.values(p.cost_breakdown).reduce((n, c) => n + c!.amount, 0)).toBe(p.summary.total_cost_per_person)
    const buffers = steps.filter((s) => s.buffer_gate && s.buffer_gate !== 'latest_return').map((s) => s.buffer_minutes!)
    expect(Math.min(...buffers)).toBe(p.summary.min_buffer_minutes)
    expect(steps.at(-1)!.buffer_minutes).toBe(p.summary.early_return_buffer_minutes)
  })
})
