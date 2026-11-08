import { describe, expect, it } from 'vitest'
import { behindExample } from './behindExample'

describe('幕後頁的示範範例', () => {
  it('用真後端跑出來的結果，數字跟首頁示範一致；不編條件', () => {
    const ex = behindExample()
    expect(ex.sample).toBe(true)
    expect(ex.request).toBeNull()
    expect(ex.result.stats).toEqual({ combinations: 73038, feasible: 1201 })
    expect(ex.result.plans).toHaveLength(3)
    expect(ex.origin).toBe('中壢')
  })
})
