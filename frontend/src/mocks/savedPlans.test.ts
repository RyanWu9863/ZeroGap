import { beforeEach, describe, expect, it } from 'vitest'
import { benchmarkRequest } from './request'
import { mockResult } from './planResult'
import { MOCK_SAVED_KEY, mockLoadPlan, mockSavePlan, newJobId, SAVED_TTL_MS } from './savedPlans'

const mem = new Map<string, string>()
beforeEach(() => {
  mem.clear()
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage
})

const NOW = new Date('2026-11-08T10:00:00+08:00')

describe('假後端的分享編號', () => {
  it('編號是 32 碼小寫十六進位，每次不一樣', () => {
    const a = newJobId()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(newJobId()).not.toBe(a)
  })

  it('存了拿得回來，帶排好時間和 7 天後的到期時間', () => {
    const id = newJobId()
    const result = mockResult(benchmarkRequest, false, id)
    mockSavePlan({ job_id: id, request: benchmarkRequest, result }, NOW)
    const doc = mockLoadPlan(id, NOW)!
    expect(doc.result.job_id).toBe(id)
    expect(doc.request).toEqual(benchmarkRequest)
    expect(Date.parse(doc.expires_at) - Date.parse(doc.created_at)).toBe(SAVED_TTL_MS)
  })

  it('超過 7 天就拿不到（跟後端的 404 一樣）', () => {
    const id = newJobId()
    mockSavePlan({ job_id: id, request: benchmarkRequest, result: mockResult(benchmarkRequest, false, id) }, NOW)
    expect(mockLoadPlan(id, new Date(NOW.getTime() + SAVED_TTL_MS + 1))).toBeNull()
  })

  it('沒存過、存的東西壞掉都回 null，不丟錯', () => {
    expect(mockLoadPlan('0'.repeat(32), NOW)).toBeNull()
    mem.set(MOCK_SAVED_KEY, '{壞掉')
    expect(mockLoadPlan('0'.repeat(32), NOW)).toBeNull()
  })

  it('最多留 20 份，舊的先丟', () => {
    const ids = Array.from({ length: 21 }, () => newJobId())
    ids.forEach((id, i) => mockSavePlan({ job_id: id, request: benchmarkRequest, result: mockResult(benchmarkRequest, false, id) }, new Date(NOW.getTime() + i)))
    expect(mockLoadPlan(ids[0], NOW)).toBeNull()
    expect(mockLoadPlan(ids[20], NOW)).not.toBeNull()
  })

  it('存成功回 true；localStorage 存不進去（私密瀏覽、空間滿）回 false，不丟例外', () => {
    const id = newJobId()
    expect(mockSavePlan({ job_id: id, request: benchmarkRequest, result: mockResult(benchmarkRequest, false, id) }, NOW)).toBe(true)
    globalThis.localStorage.setItem = () => {
      throw new DOMException('滿了', 'QuotaExceededError')
    }
    const other = newJobId()
    expect(mockSavePlan({ job_id: other, request: benchmarkRequest, result: mockResult(benchmarkRequest, false, other) }, NOW)).toBe(false)
  })
})
