import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { desktopOrder, planBadge, planTag } from './labels'

const [p1, p2, p3] = mockResult(benchmarkRequest, false).plans

describe('planTag（Q16、Q60；規格書 6.5 的 highlight）', () => {
  it('用後端的 highlight.label', () => {
    expect(planTag(p1)).toBe('最推薦')
    expect(planTag(p2)).toBe('最穩')
  })
  it('沒有 highlight 時只顯示名次', () => expect(planTag({ ...p3, highlight: null })).toBe('第 3 選擇'))
})

describe('planBadge', () => {
  it('標籤已經是「最推薦」就不重複', () => expect(planBadge(p1)).toBeNull())
  it('第一名的標籤不是最推薦時才加徽章', () => expect(planBadge({ ...p1, highlight: null })).toBe('最推薦'))
  it('其他名次沒有徽章', () => expect(planBadge(p2)).toBeNull())
})

describe('desktopOrder（Q20）', () => {
  it('第一名放中間', () => expect(desktopOrder([p3, p1, p2]).map((p) => p.rank)).toEqual([2, 1, 3]))
  it('少於 3 個就照名次', () => expect(desktopOrder([p2, p1]).map((p) => p.rank)).toEqual([1, 2]))
})
