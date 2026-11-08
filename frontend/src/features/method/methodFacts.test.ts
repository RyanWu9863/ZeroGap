import { describe, expect, it } from 'vitest'
import fixture from '@/api/__fixtures__/backend-plan-result.json'
import { PlanResult } from '@/api/schemas'
import { methodFacts } from './methodFacts'

const result = PlanResult.parse(fixture)

describe('方法頁的真數字（規格 4.5）', () => {
  const f = methodFacts(result)
  it('三層：全部組合、每段接得上、給你的方案', () => {
    expect([f.combinations, f.feasible, f.plans]).toEqual([73038, 1201, 3])
  })
  it('每一關的真數字（第 1 個方案）', () => {
    expect(f.showtimeBuffer).toBe(12)
    expect(f.lastOrderBuffer).toBe(5)
    expect(f.walkMinutes).toBe(2)
    expect(f.returnBuffer).toBe(54)
    expect(f.homeBuffer).toBe(55)
    expect(f.costTotal).toBe(510)
    expect(f.costParts).toEqual({ ticket: 330, meal: 150, fares: 30 })
    expect(f.minBuffer).toBe(5)
  })
  it('沒有那一關的數字時給 null，不編', () => {
    const plan = { ...result.plans[0], timeline: result.plans[0].timeline.map((s) => ({ ...s, buffer_minutes: null, buffer_gate: null })) }
    const g = methodFacts({ ...result, plans: [plan] })
    expect([g.showtimeBuffer, g.lastOrderBuffer, g.returnBuffer, g.homeBuffer]).toEqual([null, null, null, null])
  })
})
