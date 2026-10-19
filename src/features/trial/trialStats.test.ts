import { describe, expect, it } from 'vitest'
import { sessionTimes, summarize, toCsv } from './trialStats'
import type { TrialSession } from './trialStore'

const a: TrialSession = { id: 'a', proto: 'timetable', startedAt: 0, startClickAt: 12_000, resultAt: 52_000, answers: { yellow: 'estimate', willing: 4, faster: true } }
const b: TrialSession = { id: 'b', proto: 'linear', startedAt: 0, startClickAt: 20_000, resultAt: 90_000, answers: { yellow: 'discount', willing: 2, faster: false } }

describe('試用統計（Q79、Q80）', () => {
  it('每筆的秒數', () => expect(sessionTimes(a)).toEqual({ understand: 12, plan: 40, total: 52 }))
  it('沒走完的步驟算 null', () => expect(sessionTimes({ id: 'c', proto: 'x', startedAt: 0 }).plan).toBeNull())
  it('平均與達標數', () => {
    const s = summarize([a, b])
    expect(s.avgUnderstand).toBe(16)
    expect(s.avgPlan).toBe(55)
    expect(s.within60).toBe(1)
    expect(s.yellowCorrect).toBe(1)
    expect(s.avgWilling).toBe(3)
  })
  it('CSV 一筆一行，含表頭', () => {
    const csv = toCsv([a, b]).split('\n')
    expect(csv).toHaveLength(3)
    expect(csv[1]).toContain('a,timetable')
    expect(csv[1].endsWith('estimate,4,是')).toBe(true)
  })
})
