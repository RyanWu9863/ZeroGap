import { describe, expect, it } from 'vitest'
import type { Plan } from '@/api/schemas'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { angleAt, arcPath, bottleneck, bottleneckCopy, DIAL_SPAN, DIAL_START, dialSegments, dialTicks, polar, type Bottleneck } from './dialModel'

const base = mockResult(benchmarkRequest, false).plans[0]
const T = (hm: string) => `2026-11-08T${hm}:00+08:00`
/** 手做的簡單方案：17:00 出門、22:00 到家，五個小時剛好 300 度＝每小時 60 度 */
const simple: Plan = {
  ...base,
  depart_at: T('17:00'),
  home_at: T('22:00'),
  min_buffer_minutes: 8,
  timeline: [
    { type: 'transit', from: '中壢', to: '桃園', summary: '區間車', depart_at: T('17:00'), arrive_at: T('18:00'), fare_per_person: 30 },
    { type: 'walk', minutes: 30, arrive_at: T('18:30'), buffer_minutes: 8, buffer_gate: 'showtime' },
    { type: 'movie', starts_at: T('18:30'), ends_at: T('20:30') },
    { type: 'meal', starts_at: T('20:30'), ends_at: T('21:00'), duration: 'normal', buffer_minutes: 20, buffer_gate: 'last_order' },
    { type: 'transit', from: '桃園', to: '中壢', summary: '區間車', depart_at: T('21:00'), arrive_at: T('22:00'), fare_per_person: 30, buffer_minutes: 8, buffer_gate: 'return_trip' },
    { type: 'home', station: '中壢', arrive_at: T('22:00') },
  ],
}

describe('角度', () => {
  it('出門在 -150 度、到家在 +150 度', () => {
    expect(angleAt(T('17:00'), simple.depart_at, simple.home_at)).toBe(DIAL_START)
    expect(angleAt(T('22:00'), simple.depart_at, simple.home_at)).toBe(DIAL_START + DIAL_SPAN)
  })
  it('中間照時間比例：19:30 是正上方 0 度', () => expect(angleAt(T('19:30'), simple.depart_at, simple.home_at)).toBe(0))
  it('超出範圍夾在兩端', () => expect(angleAt(T('23:00'), simple.depart_at, simple.home_at)).toBe(150))
})

describe('每一段的弧', () => {
  it('照時間軸順序、頭尾相接、不畫長度 0 的到家', () => {
    const s = dialSegments(simple)
    expect(s.map((x) => x.type)).toEqual(['transit', 'walk', 'movie', 'meal', 'transit'])
    expect(s[0].a0).toBe(-150)
    expect(s[2]).toMatchObject({ a0: -60, a1: 60 })
    expect(s.at(-1)!.a1).toBe(150)
  })
  it('假資料的真方案也頭尾落在範圍內、一路往前', () => {
    const s = dialSegments(base)
    s.forEach((x) => {
      expect(x.a0).toBeGreaterThanOrEqual(DIAL_START)
      expect(x.a1).toBeLessThanOrEqual(DIAL_START + DIAL_SPAN)
      expect(x.a1).toBeGreaterThanOrEqual(x.a0)
    })
  })
})

describe('刻度', () => {
  it('出門和到家之間的整點（不含頭尾）', () =>
    expect(dialTicks(simple)).toEqual([
      { angle: -90, label: '18:00' },
      { angle: -30, label: '19:00' },
      { angle: 30, label: '20:00' },
      { angle: 90, label: '21:00' },
    ]))
})

describe('SVG 幾何', () => {
  it('0 度在正上方、90 度在右邊', () => {
    expect(polar(100, 100, 50, 0)).toEqual({ x: 100, y: 50 })
    const r = polar(100, 100, 50, 90)
    expect(r.x).toBeCloseTo(150)
    expect(r.y).toBeCloseTo(100)
  })
  it('超過 180 度的弧要用大弧旗標', () => {
    expect(arcPath(100, 100, 50, -150, 150)).toContain(' 0 1 1 ')
    expect(arcPath(100, 100, 50, 0, 90)).toContain(' 0 0 1 ')
  })
})

describe('瓶頸', () => {
  it('挑緩衝最小的一步；一樣小取最前面', () => {
    const b = bottleneck(simple)!
    expect(b).toMatchObject({ index: 1, minutes: 8, gate: 'showtime' })
    expect(b.angle).toBe(-60) // 那一步結束在 18:30：出門後 1.5 小時＝-150＋90
  })
  it('沒有任何緩衝資料就回 null', () => expect(bottleneck({ ...simple, timeline: simple.timeline.map(({ buffer_minutes: _b, buffer_gate: _g, ...s }) => s) as Plan['timeline'] })).toBeNull())
  it('假資料的方案：瓶頸分鐘數就是 min_buffer_minutes', () => expect(bottleneck(base)?.minutes).toBe(base.min_buffer_minutes))
})

describe('瓶頸的後果文案', () => {
  const b = (gate: Bottleneck['gate'], extra: Partial<Bottleneck> = {}): Bottleneck => ({ index: 0, minutes: 8, gate, window: null, walkHome: false, angle: 0, ...extra })
  it('開演', () => expect(bottleneckCopy(b('showtime'), '中壢站')).toEqual({ title: '開演前只剩 8 分', consequence: '這一段只要再慢超過 8 分鐘，就趕不上電影開演。' }))
  it('點餐', () => expect(bottleneckCopy(b('last_order'), '中壢站').consequence).toBe('這一段只要再慢超過 8 分鐘，餐廳就不能點餐了。'))
  it('回程車：有備案時說幾點前還有車', () =>
    expect(bottleneckCopy(b('return_trip', { window: { planned_depart_at: T('21:00'), minutes_to_planned: 8, latest_depart_at: T('21:40'), minutes_to_latest: 48 } }), '中壢站').consequence).toBe(
      '趕不上預定那班車的話，21:40 前還有車，只是會比較晚到家。',
    ))
  it('回程車：沒有備案', () => expect(bottleneckCopy(b('return_trip'), '中壢站').consequence).toBe('這一段只要再慢超過 8 分鐘，就趕不上預定那班回程車。'))
  it('回程整段走路', () => expect(bottleneckCopy(b('return_trip', { walkHome: true }), '中壢站').consequence).toBe('這一段只要再慢超過 8 分鐘，就沒辦法在你設的時間前走回中壢站。'))
  it('最晚到家', () => expect(bottleneckCopy(b('latest_return'), '中壢站')).toEqual({ title: '比最晚回到中壢站只早 8 分', consequence: '再慢超過 8 分鐘，就可能趕不上末班車、超過你設的最晚到家時間。' }))
})
