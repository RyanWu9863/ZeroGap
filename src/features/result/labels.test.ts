import { describe, expect, it } from 'vitest'
import { itineraryOk } from '@/mocks/itineraryOk'
import { desktopOrder, planTag } from './labels'

const [p1, p2, p3] = itineraryOk.top_3_proposals

describe('planTag（Q16、Q60）', () => {
  it('有 highlight 用 highlight', () => expect(planTag(p1)).toBe('最省'))
  it('沒有 highlight 時去掉 Jev', () => {
    expect(planTag({ ...p2, highlight: null })).toBe('最穩')
    expect(planTag({ ...p3, highlight: null, rank_label: 'Jev第三選擇' })).toBe('第 3 選擇')
  })
})

describe('desktopOrder（Q20）', () => {
  it('第一名放中間', () => expect(desktopOrder([p3, p1, p2]).map((p) => p.rank)).toEqual([2, 1, 3]))
})
