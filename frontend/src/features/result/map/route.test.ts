import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { hasCoords, routeNodes } from './route'

const req = { ...benchmarkRequest, date: '2026-10-30' }
const [p1, , p3] = mockResult(req, false).plans

describe('routeNodes：照時間軸順序整理路線', () => {
  const nodes = routeNodes(p1, req.date)

  it('站點順序、編號、怎麼到', () => {
    expect(nodes[0]).toMatchObject({ n: 1, kind: 'station', via: 'start' })
    expect(nodes.map((n) => n.kind)).toContain('cinema')
    expect(nodes.map((n) => n.kind)).toContain('restaurant')
    expect(nodes.map((n) => n.n)).toEqual(nodes.map((_, i) => i + 1))
    // 搭車的 place 是上車的地方，所以到影城那一段算搭車；影城到餐廳是走路
    expect(nodes.find((n) => n.kind === 'cinema')!.via).toBe('train')
    expect(nodes.find((n) => n.kind === 'restaurant')!.via).toBe('walk')
  })
  it('同一個地點連續幾步合併成一站，記下在那裡的時間', () => {
    const cinema = nodes.find((n) => n.kind === 'cinema')!
    expect(cinema.notes.length).toBeGreaterThan(1)
    expect(cinema.from).not.toBe(cinema.to)
  })
  it('Google 來源的餐廳沒有座標 → 畫不出真實地圖，只用示意圖（規格書 6.7）', () => {
    expect(p1.restaurant.source).toBe('google')
    expect(hasCoords(nodes)).toBe(false)
  })
  it('全部地點都有後端給的座標 → 畫得出真實地圖', () => {
    expect(p3.restaurant.source).toBe('osm')
    expect(hasCoords(routeNodes(p3, req.date))).toBe(true)
  })
})
