import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { routeLegs, midpoint } from './legs'
import { routeNodes } from './route'

describe('routeLegs', () => {
  it('相鄰兩站一段，搭車段帶車種', () => {
    const nodes = routeNodes(mockResult(benchmarkRequest, false).plans[0], benchmarkRequest.date)
    const legs = routeLegs(nodes)
    expect(legs).toHaveLength(nodes.length - 1)
    legs.forEach((l, i) => {
      expect(l.from).toBe(nodes[i])
      expect(l.to).toBe(nodes[i + 1])
      expect(l.mode).toBe(nodes[i + 1].via === 'train' ? 'train' : 'walk')
    })
    expect(legs.filter((l) => l.mode === 'train').every((l) => l.label)).toBe(true)
  })
  it('中點', () => expect(midpoint({ lat: 0, lng: 0 }, { lat: 2, lng: 4 })).toEqual({ lat: 1, lng: 2 }))
})
