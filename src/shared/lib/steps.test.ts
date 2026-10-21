import { describe, expect, it } from 'vitest'
import fixture from '@/api/__fixtures__/backend-plan-result.json'
import { PlanResult, type Plan } from '@/api/schemas'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { bufferSentence } from './buffer'
import { describeTimeline, timelinePlaces } from './steps'

const plan = mockResult(benchmarkRequest, false).plans[0]
const steps = describeTimeline(plan, benchmarkRequest.date)

describe('describeTimeline（規格書 6.5 的結構化步驟）', () => {
  it('每一步的時刻', () => {
    expect(steps.map((s) => s.time)).toEqual(['17:05', '17:25', '17:55', '19:54', '19:57', '20:07', '20:52', '21:05', '21:25'])
  })
  it('地點名稱：出發站叫「XX 站」', () => {
    expect(steps[0].title).toBe('中壢站')
    expect(steps.at(-1)!.title).toBe('中壢站')
  })
  it('句子', () => {
    expect(steps[0].desc).toBe('搭台鐵 區間車到桃園，約 20 分鐘')
    expect(steps[1].desc).toBe('走 5 分鐘到桃園統領威秀，取票')
    expect(steps[4].desc).toBe('候位約 10 分鐘')
    expect(steps[5].desc).toBe('日式・快速用餐約 45 分鐘，最後點餐 21:00')
  })
  it('花費：電影、用餐是估計值，車資不是', () => {
    expect(steps[2].cost).toEqual({ amount: 350, estimated: true })
    expect(steps[0].cost).toEqual({ amount: 25, estimated: false })
  })
  it('TDX 沒給車資、後端自己估的，車資也標估計值', () => {
    const real = PlanResult.parse(fixture).plans[0]
    const est: Plan = { ...real, estimated: ['ticket', 'meal', 'fare_return'] }
    const s = describeTimeline(est, real.depart_at.slice(0, 10)).filter((x) => x.type === 'transit')
    expect(s.map((x) => x.cost?.estimated)).toEqual([false, true])
  })
  it('緩衝和回程的 return_window', () => {
    expect(steps[1].buffer).toMatchObject({ minutes: 10, gate: 'showtime' })
    const back = steps[6].buffer!
    expect(back.gate).toBe('return_trip')
    expect(bufferSentence(back.gate, back.minutes, '中壢站', back.window)).toBe('8 分鐘後發車，錯過的話 22:28 前還有車')
  })
  it('跨過午夜的時刻加「隔天」', () => {
    const late: Plan = { ...plan, timeline: plan.timeline.map((s) => (s.type === 'home' ? { ...s, arrive_at: '2026-10-31T00:40:00+08:00' } : s)) }
    expect(describeTimeline(late, benchmarkRequest.date).at(-1)!.time).toBe('隔天 00:40')
  })
  it('餐廳名稱是 null 時，候位那一步改用料理類別', () => {
    const noName: Plan = { ...plan, restaurant: { ...plan.restaurant, name: null }, timeline: plan.timeline.map((s) => (s.type === 'wait' ? { ...s, place: null } : s)) }
    expect(describeTimeline(noName, benchmarkRequest.date)[4].title).toBe('一家日式餐廳')
  })
  it('公車用公車圖示', () => {
    const real = PlanResult.parse(fixture).plans[0]
    const s = describeTimeline(real, real.depart_at.slice(0, 10))
    expect(s[0].bus).toBe(true)
    expect(s.at(-2)!.bus).toBe(false)
  })
  it('路線上的地點', () => expect(timelinePlaces(plan)).toHaveLength(plan.timeline.length))
})
