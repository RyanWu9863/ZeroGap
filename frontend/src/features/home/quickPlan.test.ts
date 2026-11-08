import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { dateIssue, quickDate, quickMissing } from './quickPlan'

const ctx = { today: '2026-11-08', available: ['2026-11-08', '2026-11-09', '2026-11-12'] }
const known = { areas: ['taoyuan', 'zhongli'], stations: [103, 104] }
const req = { ...benchmarkRequest, area: 'taoyuan', origin_station_id: 103, date: '2026-11-09', budget_per_person: 1000 }
// 固定「現在」：早上十點，今天的 17:00 出發還沒過
const morning = { date: '2026-11-08', minutes: 10 * 60 }
const evening = { date: '2026-11-08', minutes: 18 * 60 }

describe('quickDate', () => {
  it('目前的日期可以用就不動', () => expect(quickDate('2026-11-09', ctx, '17:00', morning)).toBe('2026-11-09'))
  it('過期或那天沒場次：換成從今天算起最近的可選日', () => {
    expect(quickDate('2026-11-01', ctx, '17:00', morning)).toBe('2026-11-08')
    expect(quickDate('2026-11-10', ctx, '17:00', morning)).toBe('2026-11-08')
  })
  it('一天都沒有：空字串，請使用者自己選', () => expect(quickDate('2026-11-09', { today: '2026-11-08', available: [] }, '17:00', morning)).toBe(''))
  it('今天的出發時間已過：換到之後最近的可選日', () => expect(quickDate('2026-11-08', ctx, '17:00', evening)).toBe('2026-11-09'))
  it('今天的出發時間還沒到：留在今天', () => expect(quickDate('2026-11-08', ctx, '19:00', evening)).toBe('2026-11-08'))
  it('出發時間已過又沒有之後的日子：空字串', () => {
    expect(quickDate('2026-11-08', { today: '2026-11-08', available: ['2026-11-08'] }, '17:00', evening)).toBe('')
  })
  it('沒有可選日清單：維持原樣', () => expect(quickDate('2026-11-08', { today: '2026-11-08' }, '17:00', evening)).toBe('2026-11-08'))
})

describe('quickMissing', () => {
  it('四格都好：空的', () => expect(quickMissing(req, known, ctx, morning)).toEqual([]))
  it('照畫面順序列出缺的格子', () => {
    expect(quickMissing({ ...req, area: 'nowhere', origin_station_id: 999, date: '', budget_per_person: 0 }, known, ctx, morning)).toEqual(['area', 'origin', 'date', 'budget'])
  })
  it('用目前位置出發算有填', () => {
    expect(quickMissing({ ...req, origin_station_id: null, origin_lat: 24.95, origin_lng: 121.22 }, known, ctx, morning)).toEqual([])
  })
  it('清單還沒載入：那一格先不檢查', () => {
    expect(quickMissing({ ...req, area: 'whatever', origin_station_id: 999 }, {}, ctx, morning)).toEqual([])
  })
  it('沒選出發地也沒用目前位置（站清單已載入）：缺出發', () => {
    expect(quickMissing({ ...req, origin_station_id: null }, known, ctx, morning)).toEqual(['origin'])
  })
  it('今天的出發時間已過：日期算缺', () => {
    expect(quickMissing({ ...req, date: '2026-11-08' }, known, ctx, evening)).toEqual(['date'])
  })
})

describe('dateIssue', () => {
  it('正常：null', () => expect(dateIssue(req, ctx, morning)).toBeNull())
  it('今天出發時間已過：past-departure', () => expect(dateIssue({ ...req, date: '2026-11-08' }, ctx, evening)).toBe('past-departure'))
  it('那天沒場次：unusable', () => expect(dateIssue({ ...req, date: '2026-11-10' }, ctx, morning)).toBe('unusable'))
  it('沒填日期：unusable', () => expect(dateIssue({ ...req, date: '' }, ctx, morning)).toBe('unusable'))
})
