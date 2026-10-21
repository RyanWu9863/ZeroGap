import { describe, expect, it } from 'vitest'
import { areas, stations } from '@/mocks/catalog'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import fixture from './__fixtures__/backend-plan-result.json'
import { AreasResponse, PlanResult, StationsResponse } from './schemas'

/** 前後端合約（v0.13）。fixture 是後端 tools/contract-check 在 2026-10-21 收到的真實回應 */
const clone = () => structuredClone(fixture) as typeof fixture

describe('PlanResult（規格書 6.5）', () => {
  it('後端實際的回應通過驗證', () => {
    const r = PlanResult.parse(fixture)
    expect(r.plans.map((p) => p.highlight?.key)).toEqual(['recommended', 'cheapest', 'safest'])
  })
  it('餐廳來源可以是 demo（示意資料，v0.11）', () => {
    const d = clone()
    d.plans[0].restaurant.source = 'demo'
    expect(PlanResult.safeParse(d).success).toBe(true)
  })
  it('餐廳名稱可以是 null（Google 額度用完，v0.10）', () => {
    const d = clone() as unknown as { plans: { restaurant: { name: string | null } }[] }
    d.plans[0].restaurant.name = null
    expect(PlanResult.safeParse(d).success).toBe(true)
  })
  it('hours_verified 一定要有', () => {
    const d = clone() as unknown as { plans: { restaurant: Record<string, unknown> }[] }
    delete d.plans[0].restaurant.hours_verified
    expect(PlanResult.safeParse(d).success).toBe(false)
  })
  it('alternatives 只有部分 key、或是空物件都可以（v0.12）', () => {
    const r = PlanResult.parse(fixture)
    expect(Object.keys(r.plans[1].alternatives)).toEqual(['route_go', 'route_return'])
    const d = clone() as unknown as { plans: { alternatives: unknown }[] }
    d.plans[0].alternatives = {}
    expect(PlanResult.parse(d).plans[0].alternatives).toEqual({})
  })
  it('電影備選有搭配的餐廳欄位（v0.11）', () => {
    const alt = PlanResult.parse(fixture).plans[0].alternatives.movie!
    expect(alt[0].restaurant_name).toBe('Subway')
    expect(alt[1].restaurant_id).toBeNull()
  })
  it('假資料的三種結果也通過驗證', () => {
    expect(PlanResult.safeParse(mockResult(benchmarkRequest, false)).success).toBe(true)
    expect(PlanResult.safeParse(mockResult(benchmarkRequest, true)).success).toBe(true)
    expect(PlanResult.safeParse(mockResult({ ...benchmarkRequest, movie_id: 12 }, true)).success).toBe(true)
  })
})

describe('假資料的下拉選單跟後端一樣（v0.13）', () => {
  it('青埔不開放、有蘆竹（南崁）', () => {
    const a = AreasResponse.parse(areas)
    expect(a.find((x) => x.code === 'qingpu')?.is_open).toBe(false)
    expect(a.some((x) => x.code === 'luzhu' && x.is_open)).toBe(true)
  })
  it('車站有 operator', () => expect(StationsResponse.parse(stations).every((s) => s.operator)).toBe(true))
})
