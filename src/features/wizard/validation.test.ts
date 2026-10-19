import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { blankRequest } from '@/store/planStore'
import { durationLabel, firstIncomplete, minutesAvailable, stepComplete, toHHMM, toMinutes, tooTight } from './validation'

describe('時間換算', () => {
  it('來回一致', () => {
    expect(toMinutes('17:15')).toBe(1035)
    expect(toHHMM(1035)).toBe('17:15')
  })
})

describe('stepComplete', () => {
  it('基準案例四步都填完', () => expect(firstIncomplete(benchmarkRequest)).toBeNull())
  it('清空後卡在第 1 步', () => expect(firstIncomplete(blankRequest)).toBe(1))
  it('回到站早於出門 → 第 2 步沒完成', () => {
    expect(stepComplete(2, { ...benchmarkRequest, earliest_departure: '20:00', latest_return: '19:00' })).toBe(false)
  })
})

describe('柔性提醒（Q70）', () => {
  it('17:00–23:00 有 6 小時，不提醒', () => {
    expect(durationLabel(minutesAvailable(benchmarkRequest))).toBe('6 小時')
    expect(tooTight(benchmarkRequest)).toBe(false)
  })
  it('2 小時 15 分就提醒，而且顯示精確時間', () => {
    const r = { ...benchmarkRequest, earliest_departure: '20:45', latest_return: '23:00' }
    expect(tooTight(r)).toBe(true)
    expect(durationLabel(minutesAvailable(r))).toBe('2 小時 15 分')
  })
})
