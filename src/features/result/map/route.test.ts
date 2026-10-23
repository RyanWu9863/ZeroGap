import { describe, expect, it } from 'vitest'
import { itineraryOk } from '@/mocks/itineraryOk'
import { itineraryWeekend } from '@/mocks/itineraryScenarios'
import { hasCoords, routeNodes } from './route'

describe('routeNodes：照時間軸順序整理路線', () => {
  const nodes = routeNodes(itineraryOk.top_3_proposals[0])

  it('站點順序、編號、怎麼到', () => {
    expect(nodes.map((n) => [n.n, n.name, n.via])).toEqual([
      [1, '中壢車站', 'start'],
      [2, '桃園統領威秀', 'train'],
      [3, '吉豚屋', 'walk'],
      [4, '桃園車站', 'walk'],
      [5, '中壢車站', 'train'],
    ])
  })
  it('同一個地點連續幾步合併成一站，記下在那裡的時間', () => {
    expect(nodes[1]).toMatchObject({ from: '17:40', to: '17:55' })
    expect(nodes[1].notes).toHaveLength(2)
  })
  it('假資料沒有座標 → 用示意座標，並標記 approx', () => {
    expect(hasCoords(nodes)).toBe(true)
    expect(nodes.every((n) => n.approx)).toBe(true)
  })
  it('後端給了座標就用後端的', () => {
    const p = structuredClone(itineraryOk.top_3_proposals[0])
    p.timeline_steps[0].place = { name: '中壢車站', kind: 'station', lat: 1, lng: 2 }
    expect(routeNodes(p)[0]).toMatchObject({ lat: 1, lng: 2, approx: false })
  })
  it('不認得的地點沒有座標 → 畫不出真實地圖', () => {
    const p = structuredClone(itineraryWeekend.top_3_proposals[0])
    p.timeline_steps[1].place = { name: '不存在的店', kind: 'restaurant' }
    expect(hasCoords(routeNodes(p))).toBe(false)
  })
})
