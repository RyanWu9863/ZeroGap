import { describe, expect, it } from 'vitest'
import { latestUpdate } from './latestUpdate'

describe('latestUpdate', () => {
  it('挑最新的時間', () => {
    expect(latestUpdate(['2026-01-01T00:00:00Z', null, '2026-02-01T00:00:00Z'])?.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })
  it('略過無法解析的時間；都不能用就回 null，不丟錯', () => {
    expect(latestUpdate(['壞掉', '2026-01-01T00:00:00Z'])?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(latestUpdate(['壞掉', null])).toBeNull()
    expect(latestUpdate([])).toBeNull()
  })
})
