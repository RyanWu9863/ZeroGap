import { describe, expect, it } from 'vitest'
import { fromISODate, isPastDate, nearestAvailable, toISODate } from './dates'

describe('日期小工具（P0-1）', () => {
  it('ISO 字串來回一致，而且用當地時間', () => {
    expect(toISODate(fromISODate('2026-11-02'))).toBe('2026-11-02')
    expect(fromISODate('2026-11-02').getHours()).toBe(0)
  })
  it('過去的日期才算過期；今天和空字串都不算', () => {
    expect(isPastDate('2026-10-30', '2026-11-02')).toBe(true)
    expect(isPastDate('2026-11-02', '2026-11-02')).toBe(false)
    expect(isPastDate('', '2026-11-02')).toBe(false)
  })
  it('最近可選日：跳過過去的日子，清單沒排序也行', () => {
    expect(nearestAvailable(['2026-11-05', '2026-10-30', '2026-11-03'], '2026-11-02')).toBe('2026-11-03')
    expect(nearestAvailable(['2026-11-02'], '2026-11-02')).toBe('2026-11-02')
    expect(nearestAvailable(['2026-10-30'], '2026-11-02')).toBeNull()
  })
})
