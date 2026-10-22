import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { bufferLevel, bufferSentence } from './buffer'
import { itineraryToText } from './copyText'
import { formatCost, formatDate, formatMoney, restaurantName, stationDisplay, stationLabel, walkDistance } from './format'
import { placeUrl, routeUrl } from './maps'

describe('bufferLevel（Q40）', () => {
  it('邊界值：30 寬鬆、29 剛好、10 剛好、9 偏緊', () => {
    expect(bufferLevel(30)).toBe('roomy')
    expect(bufferLevel(29)).toBe('snug')
    expect(bufferLevel(10)).toBe('snug')
    expect(bufferLevel(9)).toBe('tight')
  })
  it('白話句子', () => {
    expect(bufferSentence('showtime', 10)).toBe('開演前還有 10 分')
    expect(bufferSentence('latest_return', 57, '中壢站')).toBe('比最晚回到中壢站早 57 分')
  })
})

describe('format（Q82）', () => {
  it('日期帶星期', () => expect(formatDate('2026-10-30')).toBe('10/30（五）'))
  it('金額千分位', () => expect(formatMoney(1000)).toBe('$1,000'))
  it('估計值加「約」', () => {
    expect(formatCost(300, true)).toBe('約 $300')
    expect(formatCost(25, false)).toBe('$25')
  })
  it('車站統一叫「XX 站」', () => {
    expect(stationLabel('中壢車站')).toBe('中壢站')
    expect(stationLabel('中壢')).toBe('中壢站')
    expect(stationLabel('高鐵桃園站')).toBe('高鐵桃園站')
  })
  it('同名的台鐵、高鐵桃園站分得出來', () => {
    expect(stationDisplay({ name: '桃園', operator: 'TRA' })).toBe('桃園站')
    expect(stationDisplay({ name: '桃園', operator: 'THSR' })).toBe('高鐵桃園站')
    expect(stationDisplay({ name: '高鐵桃園站', operator: 'TYMC' })).toBe('機捷高鐵桃園站')
  })
  it('沒有店名時用料理類別', () => {
    expect(restaurantName(null, '日式')).toBe('一家日式餐廳')
    expect(restaurantName('吉豚屋', '日式')).toBe('吉豚屋')
  })
  it('步行換算距離（Q52）', () => {
    expect(walkDistance(12)).toBe('約 1 公里')
    expect(walkDistance(5)).toBe('約 400 公尺')
  })
})

describe('maps（Q28b）', () => {
  it('單一地點用名稱搜尋', () => {
    expect(placeUrl({ name: '吉豚屋' })).toContain('query=%E5%90%89')
  })
  it('只有兩點時用大眾運輸', () => {
    const url = routeUrl([{ name: 'A' }, { name: 'B' }])
    expect(url).toContain('travelmode=transit')
    expect(url).not.toContain('waypoints')
  })
  it('Google 來源的餐廳：place_id 一定同時帶名稱', () => {
    const url = new URL(placeUrl({ name: '吉豚屋', place_id: 'ChIJabc' }))
    expect(url.searchParams.get('query')).toBe('吉豚屋')
    expect(url.searchParams.get('query_place_id')).toBe('ChIJabc')
  })
  it('有座標的地點用座標', () => {
    expect(new URL(placeUrl({ name: '中壢站', lat: 24.95, lng: 121.22 })).searchParams.get('query')).toBe('24.95,121.22')
  })
  it('終點是 Google 來源：destination_place_id 和 destination 一起帶', () => {
    const url = new URL(routeUrl([{ name: '中壢站', lat: 24.95, lng: 121.22 }, { name: '吉豚屋', place_id: 'ChIJabc' }]))
    expect(url.searchParams.get('destination')).toBe('吉豚屋')
    expect(url.searchParams.get('destination_place_id')).toBe('ChIJabc')
  })
  it('中途點只有部分有 place_id 時不帶 waypoint_place_ids（順序對不上）', () => {
    const url = new URL(routeUrl([{ name: 'A' }, { name: '吉豚屋', place_id: 'ChIJabc' }, { name: 'C', lat: 1, lng: 2 }, { name: 'D' }]))
    expect(url.searchParams.get('waypoints')).toBe('吉豚屋|1,2')
    expect(url.searchParams.has('waypoint_place_ids')).toBe(false)
  })
  it('有中途點時不指定交通方式，並去掉連續重複地點', () => {
    const url = routeUrl([{ name: 'A' }, { name: 'B' }, { name: 'B' }, { name: 'C' }])
    expect(url).toContain('waypoints=B')
    expect(url).not.toContain('travelmode')
  })
})

describe('itineraryToText（Q61）', () => {
  const plan = mockResult(benchmarkRequest, false).plans[0]
  const names = { area: '桃園區', station: '中壢站' }
  const text = itineraryToText(benchmarkRequest, plan, names)
  it('第一行是日期標題', () => expect(text.split('\n')[0]).toBe('📅 10/30（五） 桃園區行程'))
  it('每個時刻都在，電影和餐廳帶名稱', () => {
    for (const t of ['17:05', '17:55', '20:07', '21:25']) expect(text).toContain(t)
    expect(text).toContain('17:55 桃園統領威秀：《劇場版 魔法少女小圓》')
    expect(text).toContain('20:07 吉豚屋：')
  })
  it('回到站、估計值', () => {
    expect(text).toContain('21:25 回到中壢站')
    expect(text).toContain('每人約 $550（含估計值）')
  })
  it('Google 來源加一行出處', () => expect(text).toContain('餐廳資料：Google Maps'))
  it('附路線連結和署名', () => {
    expect(text).toContain('https://www.google.com/maps/dir/')
    expect(text.trim().endsWith('由 ZeroGap 零空檔排程')).toBe(true)
  })
  it('換過餐廳時多一行估計', () => {
    const t = itineraryToText(benchmarkRequest, plan, names, { name: '福勝亭', alsoRestaurant: null, homeAt: '2026-10-30T21:40:00+08:00', total: 750 })
    expect(t).toContain('※ 改選福勝亭：約 21:40 回到站、每人約 $750')
  })
  it('OSM 來源標 OpenStreetMap', () => {
    const p3 = mockResult(benchmarkRequest, false).plans[2]
    expect(itineraryToText(benchmarkRequest, p3, names)).toContain('OpenStreetMap')
  })
})

describe('從目前位置出發的複製文字（2026-10-21）', () => {
  const req = { ...benchmarkRequest, origin_station_id: null, origin_lat: 24.971, origin_lng: 121.21 }
  const plan = mockResult(req, false).plans[0]
  const text = itineraryToText(req, plan, { area: '桃園區', station: '目前位置' })
  it('寫「目前位置」，不帶座標', () => {
    expect(text).toContain('21:25 回到目前位置')
    expect(text).not.toContain('24.971')
    expect(text).not.toContain('121.21')
  })
})
