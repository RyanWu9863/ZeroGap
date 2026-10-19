import { describe, expect, it } from 'vitest'
import { itineraryOk } from '@/mocks/itineraryOk'
import { benchmarkRequest } from '@/mocks/request'
import { funnelStages } from './funnel'

describe('funnelStages', () => {
  it('每關剩下的組數遞減，最後等於 feasible_count', () => {
    const s = funnelStages(benchmarkRequest, itineraryOk)!
    expect(s.map((x) => x.remaining)).toEqual([1060, 450, 190, 89, 39])
    expect(s.at(-1)!.remaining).toBe(itineraryOk.funnel_stats.feasible_count)
    expect(s[0].label).toBe('趕得上開演')
    expect(s[0].tech).toBe('時空連貫')
  })
  it('沒有每關剔除數 → null', () => {
    const d = { ...itineraryOk, funnel_stats: { ...itineraryOk.funnel_stats, by_filter: undefined } }
    expect(funnelStages(benchmarkRequest, d)).toBeNull()
  })
})
