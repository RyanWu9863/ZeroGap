import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { blankRequest } from '@/store/planStore'
import { dateUsable, departureInPast, durationLabel, firstIncomplete, homeLabel, homeMinutes, minutesAvailable, stepComplete, toHHMM, toMinutes, tooTight } from './validation'

describe('時間換算', () => {
  it('來回一致', () => {
    expect(toMinutes('17:15')).toBe(1035)
    expect(toHHMM(1035)).toBe('17:15')
  })
})

describe('stepComplete', () => {
  // 基準案例的日期是「今天」，下午五點後出發時間已過；測試固定一個未來日期
  it('基準案例四步都填完', () => expect(firstIncomplete({ ...benchmarkRequest, date: '2099-01-01' })).toBeNull())
  it('清空後卡在第 1 步', () => expect(firstIncomplete(blankRequest)).toBe(1))
  it('回到站早於出門 → 第 2 步沒完成', () => {
    expect(stepComplete(2, { ...benchmarkRequest, earliest_departure: '20:00', latest_home: '19:00' })).toBe(false)
  })
})

describe('日期要能用（P0-1）', () => {
  const ctx = { today: '2026-11-02', available: ['2026-11-02', '2026-11-03'] }
  it('過去的日期不通過，精靈會停在第 2 步', () => {
    expect(dateUsable('2026-10-30', ctx)).toBe(false)
    expect(firstIncomplete({ ...benchmarkRequest, date: '2026-10-30' }, ctx)).toBe(2)
  })
  it('沒有場次的日子不通過', () => expect(dateUsable('2026-11-04', ctx)).toBe(false))
  it('今天、可選日都通過', () => {
    expect(dateUsable('2026-11-02', ctx)).toBe(true)
    expect(firstIncomplete({ ...benchmarkRequest, date: '2026-11-03' }, ctx)).toBeNull()
  })
  it('沒給背景資訊時只檢查有沒有填', () => {
    expect(dateUsable('2026-10-30')).toBe(true)
    expect(dateUsable('')).toBe(false)
  })
})

describe('柔性提醒（Q70）', () => {
  it('17:00–23:00 有 6 小時，不提醒', () => {
    expect(durationLabel(minutesAvailable(benchmarkRequest))).toBe('6 小時')
    expect(tooTight(benchmarkRequest)).toBe(false)
  })
  it('2 小時 15 分就提醒，而且顯示精確時間', () => {
    const r = { ...benchmarkRequest, earliest_departure: '20:45', latest_home: '23:00' }
    expect(tooTight(r)).toBe(true)
    expect(durationLabel(minutesAvailable(r))).toBe('2 小時 15 分')
  })
})

describe('跨午夜（規格書 6.4：早於 06:00 算隔天，最晚 02:00）', () => {
  it('01:30 算隔天', () => {
    expect(homeMinutes('01:30')).toBe(25 * 60 + 30)
    expect(homeLabel('01:30')).toBe('隔天 01:30')
    expect(homeLabel('23:00')).toBe('23:00')
  })
  it('17:00 出門、隔天 01:30 回到站，有 8 小時 30 分', () => {
    expect(durationLabel(minutesAvailable({ ...benchmarkRequest, latest_home: '01:30' }))).toBe('8 小時 30 分')
  })
})

describe('今天不能選過去的出門時間', () => {
  const now = { date: '2026-10-30', minutes: 17 * 60 + 30 }
  const r = { ...benchmarkRequest, date: '2026-10-30' }
  it('今天 17:00 出門，現在 17:30 → 已經過了', () => expect(departureInPast(r, now)).toBe(true))
  it('別天不受影響', () => expect(departureInPast(r, { ...now, date: '2026-10-29' })).toBe(false))
})

describe('出發點二擇一（2026-10-21）', () => {
  it('用目前位置也算第 1 步填完', () => {
    expect(stepComplete(1, { ...benchmarkRequest, origin_station_id: null, origin_lat: 24.971, origin_lng: 121.21 })).toBe(true)
    expect(stepComplete(1, { ...benchmarkRequest, origin_station_id: 0 })).toBe(false)
  })
})
