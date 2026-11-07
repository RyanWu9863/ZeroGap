import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { planPath, rerunPath } from './planPath'

const ID = 'b'.repeat(32)
describe('結果頁網址', () => {
  it('第 1 個方案不帶 plan', () => expect(planPath(ID, 1, '')).toBe(`/p/${ID}`))
  it('第 2、3 個方案帶 plan', () => expect(planPath(ID, 3, '?from=1')).toBe(`/p/${ID}?plan=3`))
  it('開發用的 mock 情境跟著帶，其他條件參數不帶', () =>
    expect(planPath(ID, 2, '?from=103&to=taoyuan&mock=low_confidence')).toBe(`/p/${ID}?plan=2&mock=low_confidence`))
})
describe('用同樣條件重排的網址', () => {
  it('條件寫回 /result，mock 情境跟著帶', () => {
    const url = new URL(rerunPath(benchmarkRequest, '?plan=2&mock=no_solution'), 'http://x')
    expect(url.pathname).toBe('/result')
    expect(url.searchParams.get('to')).toBe(benchmarkRequest.area)
    expect(url.searchParams.get('plan')).toBeNull()
    expect(url.searchParams.get('mock')).toBe('no_solution')
  })
})
