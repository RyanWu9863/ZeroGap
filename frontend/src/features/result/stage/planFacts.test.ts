import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { planFacts, ribbon } from './planFacts'

const [p1, , p3] = mockResult(benchmarkRequest, false).plans

describe('planFacts：從後端方案整理卡片重點', () => {
  it('看完再吃的方案', () => {
    expect(planFacts(p1)).toMatchObject({ movie: '劇場版 魔法少女小圓', restaurant: '吉豚屋', order: '看完再吃' })
  })
  it('全程是後端給的出門到回到家', () => {
    expect(planFacts(p3).duration).toMatch(/^\d+ 小時( \d+ 分)?$/)
  })
})

describe('ribbon：時間軸緞帶', () => {
  it('每段接在上一段後面，加起來剛好是全程', () => {
    const r = ribbon(p1)
    expect(r[0].start).toBe(0)
    for (let i = 1; i < r.length; i++) expect(r[i].start).toBeCloseTo(r[i - 1].start + r[i - 1].length)
    expect(r.reduce((a, s) => a + s.length, 0)).toBeCloseTo(1)
    expect(r.some((s) => s.type === 'movie')).toBe(true)
  })
})
