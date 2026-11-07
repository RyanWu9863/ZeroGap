import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { quickDate, quickMissing } from './quickPlan'

const ctx = { today: '2026-11-08', available: ['2026-11-08', '2026-11-09', '2026-11-12'] }
const known = { areas: ['taoyuan', 'zhongli'], stations: [103, 104] }
const req = { ...benchmarkRequest, area: 'taoyuan', origin_station_id: 103, date: '2026-11-09', budget_per_person: 1000 }

describe('quickDate', () => {
  it('目前的日期可以用就不動', () => expect(quickDate('2026-11-09', ctx)).toBe('2026-11-09'))
  it('過期或那天沒場次：換成從今天算起最近的可選日', () => {
    expect(quickDate('2026-11-01', ctx)).toBe('2026-11-08')
    expect(quickDate('2026-11-10', ctx)).toBe('2026-11-08')
  })
  it('一天都沒有：空字串，請使用者自己選', () => expect(quickDate('2026-11-09', { today: '2026-11-08', available: [] })).toBe(''))
})

describe('quickMissing', () => {
  it('四格都好：空的', () => expect(quickMissing(req, known, ctx)).toEqual([]))
  it('照畫面順序列出缺的格子', () => {
    expect(quickMissing({ ...req, area: 'nowhere', origin_station_id: 999, date: '', budget_per_person: 0 }, known, ctx)).toEqual(['area', 'origin', 'date', 'budget'])
  })
  it('用目前位置出發算有填', () => {
    expect(quickMissing({ ...req, origin_station_id: null, origin_lat: 24.95, origin_lng: 121.22 }, known, ctx)).toEqual([])
  })
  it('清單還沒載入：那一格先不檢查', () => {
    expect(quickMissing({ ...req, area: 'whatever', origin_station_id: 999 }, {}, ctx)).toEqual([])
  })
})
