import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { requestKey } from '@/store/planStore'
import { readRank, readRequest, writeRequest } from './urlState'

describe('條件 ↔ 網址（Q62）', () => {
  it('寫進去再讀回來，條件完全一樣（動畫的鑰匙也一樣）', () => {
    const p = writeRequest(new URLSearchParams(), benchmarkRequest, 1)
    const back = readRequest(p)!
    expect(back).toEqual(benchmarkRequest)
    expect(requestKey(back)).toBe(requestKey(benchmarkRequest))
  })
  it('預設值不寫進網址，網址比較短', () => {
    const p = writeRequest(new URLSearchParams(), benchmarkRequest, 1)
    expect(p.has('movie')).toBe(false)
    expect(p.has('genre')).toBe(false)
    expect(p.get('food')).toBe('日式')
    expect(p.has('plan')).toBe(false)
  })
  it('指定片名、先吃再看、第 2 案', () => {
    const r = { ...benchmarkRequest, movie_title: '不存在的罪人', dining_order: '先吃再看' as const }
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
    const p = writeRequest(new URLSearchParams(), benchmarkRequest, 1)
    p.set('budget', 'abc')
    expect(readRequest(p)).toBeNull()
  })
})
