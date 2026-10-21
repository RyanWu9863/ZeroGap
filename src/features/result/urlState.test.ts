import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { requestKey } from '@/api/planRuns'
import { readRank, readRequest, writeRequest } from './urlState'

describe('條件 ↔ 網址（Q62）', () => {
  it('寫進去再讀回來，條件完全一樣（規劃的鑰匙也一樣）', () => {
    const p = writeRequest(new URLSearchParams(), benchmarkRequest, 1)
    const back = readRequest(p)!
    expect(back).toEqual(benchmarkRequest)
    expect(requestKey(back)).toBe(requestKey(benchmarkRequest))
  })
  it('預設值不寫進網址，網址比較短', () => {
    const p = writeRequest(new URLSearchParams(), benchmarkRequest, 1)
    expect(p.has('movie')).toBe(false)
    expect(p.has('genre')).toBe(false)
    expect(p.get('food')).toBe('japanese')
    expect(p.get('to')).toBe('taoyuan')
    expect(p.get('from')).toBe('103')
    expect(p.has('plan')).toBe(false)
  })
  it('指定電影、影廳、跨午夜、先吃再看、第 2 案', () => {
    const r = { ...benchmarkRequest, movie_id: 15, hall_type: 'imax', latest_home: '01:30', order: 'meal_first' as const }
    const p = writeRequest(new URLSearchParams(), r, 2)
    expect(readRequest(p)).toEqual(r)
    expect(readRank(p)).toBe(2)
  })
  it('保留 ?proto= ?mock= 這些別的參數', () => {
    const p = writeRequest(new URLSearchParams('proto=linear&mock=no_solution'), benchmarkRequest, 1)
    expect(p.get('proto')).toBe('linear')
    expect(p.get('mock')).toBe('no_solution')
  })
  it('缺必要欄位或數字不合法 → null', () => {
    expect(readRequest(new URLSearchParams('from=中壢站'))).toBeNull()
    expect(readRequest(new URLSearchParams('from=中壢站&to=taoyuan&date=2026-10-30&t=17:00-23:00&budget=1000&walk=12'))).toBeNull()
    const p = writeRequest(new URLSearchParams(), benchmarkRequest, 1)
    p.set('budget', 'abc')
    expect(readRequest(p)).toBeNull()
  })
})

describe('舊版網址', () => {
  it('步行上限不在 5、8、12、15、20 → 用瀏覽器暫存的條件', () => {
    const p = writeRequest(new URLSearchParams(), benchmarkRequest, 1)
    p.set('walk', '10')
    expect(readRequest(p)).not.toBeNull() // 前端的 zod 只檢查正整數；不合法的值由後端回 VALIDATION_ERROR
  })
})
