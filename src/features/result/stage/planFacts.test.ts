import { describe, expect, it } from 'vitest'
import { itineraryOk } from '@/mocks/itineraryOk'
import { itineraryWeekend } from '@/mocks/itineraryScenarios'
import { planFacts, ribbon } from './planFacts'

describe('planFacts：從後端方案整理卡片重點', () => {
  it('看完再吃的方案', () => {
    expect(planFacts(itineraryOk.top_3_proposals[0])).toEqual({
      movie: '劇場版 魔法少女小圓',
      theater: '桃園統領威秀',
      restaurant: '吉豚屋',
      duration: '4 小時 48 分',
      order: '看完再吃',
    })
  })
  it('先吃再看的方案', () => {
    expect(planFacts(itineraryWeekend.top_3_proposals[2])).toMatchObject({ restaurant: '福勝亭', order: '先吃再看', duration: '4 小時 5 分' })
  })
})

describe('ribbon：時間軸緞帶', () => {
  it('每段接在上一段後面，加起來剛好是全程', () => {
    const r = ribbon(itineraryOk.top_3_proposals[0])
    expect(r[0].start).toBe(0)
    for (let i = 1; i < r.length; i++) expect(r[i].start).toBeCloseTo(r[i - 1].start + r[i - 1].length)
    expect(r.reduce((a, s) => a + s.length, 0)).toBeCloseTo(1)
    expect(r.find((s) => s.type === '電影')!.length).toBeCloseTo(131 / 288)
  })
})
