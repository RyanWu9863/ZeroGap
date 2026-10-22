import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { funnelStages } from './funnel'

describe('funnelStages', () => {
  it('全部組合 → 每段都接得上 → 給你的方案', () => {
    const s = funnelStages(mockResult(benchmarkRequest, false))
    expect(s.map((x) => x.remaining)).toEqual([39, 3])
    expect(s.map((x) => x.eliminated)).toEqual([1880 - 39, 36])
    expect(s[0].label).toBe('每段都接得上')
  })
})
