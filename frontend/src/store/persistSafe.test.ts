import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { pickValid, validItems } from './persistSafe'

describe('暫存安全讀取（P1-3）', () => {
  const fields = { n: z.number(), s: z.string().nullable() }
  it('合格的欄位留下，不合格的丟掉', () => {
    expect(pickValid<{ n: number; s: string | null }>({ n: 'x', s: null }, fields)).toEqual({ s: null })
  })
  it('整份不是物件 → 全部用預設值', () => {
    expect(pickValid(null, fields)).toEqual({})
    expect(pickValid('壞掉了', fields)).toEqual({})
  })
  it('清單逐筆驗證，壞的那筆丟掉，其他留著', () => {
    expect(validItems([1, 'x', 3], z.number())).toEqual([1, 3])
    expect(validItems('not-array', z.number())).toBeUndefined()
  })
})
