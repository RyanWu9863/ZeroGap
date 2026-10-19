import { describe, expect, it } from 'vitest'
import { itineraryOk } from '@/mocks/itineraryOk'
import { benchmarkRequest } from '@/mocks/request'
import { bufferLevel, bufferSentence } from './buffer'
import { itineraryToText } from './copyText'
import { formatCost, formatDate, formatMoney, stationLabel, walkDistance } from './format'
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
  it('車站統一叫「XX 站」', () => expect(stationLabel('中壢車站')).toBe('中壢站'))
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
  it('有中途點時不指定交通方式，並去掉連續重複地點', () => {
    const url = routeUrl([{ name: 'A' }, { name: 'B' }, { name: 'B' }, { name: 'C' }])
    expect(url).toContain('waypoints=B')
    expect(url).not.toContain('travelmode')
  })
})

describe('itineraryToText（Q61）', () => {
  const text = itineraryToText(benchmarkRequest, itineraryOk.top_3_proposals[0])
  it('第一行是日期標題', () => expect(text.split('\n')[0]).toBe('📅 10/30（五） 桃園區行程'))
  it('每個時間點都在', () => {
    for (const s of itineraryOk.top_3_proposals[0].timeline_steps) expect(text).toContain(s.time)
  })
  it('有估計值時註明', () => expect(text).toContain('每人約 $550（含估計值）'))
  it('附路線連結和署名', () => {
    expect(text).toContain('https://www.google.com/maps/dir/')
    expect(text.trim().endsWith('由 ZeroGap 零空檔排程')).toBe(true)
  })
})
