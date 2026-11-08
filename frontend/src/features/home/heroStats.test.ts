import { describe, expect, it } from 'vitest'
import fixture from '@/api/__fixtures__/backend-plan-result.json'
import type { Run } from '@/api/planRuns'
import { heroStats, SAMPLE_STATS } from './heroStats'

const done = (combinations: number, feasible: number, plans: number): Run =>
  ({ status: 'done', finishedAt: 1_700_000_000_000, result: { stats: { combinations, feasible }, plans: Array(plans).fill({}) } }) as unknown as Run

describe('heroStats', () => {
  it('示範數字和真後端的範例結果一致（範例檔換了這裡要跟著改）', () => {
    expect(SAMPLE_STATS).toEqual({ combinations: fixture.stats.combinations, feasible: fixture.stats.feasible, plans: fixture.plans.length })
  })
  it('沒排過：用示範數字並標示範', () => {
    expect(heroStats({ runs: {}, lastDoneKey: null })).toEqual({ ...SAMPLE_STATS, sample: true, finishedAt: null })
  })
  it('排過：用上次的真數字', () => {
    expect(heroStats({ runs: { k: done(500, 20, 3) }, lastDoneKey: 'k' })).toEqual({ combinations: 500, feasible: 20, plans: 3, sample: false, finishedAt: 1_700_000_000_000 })
  })
  it('上次那筆不見了或沒有結果：回到示範', () => {
    expect(heroStats({ runs: {}, lastDoneKey: 'gone' }).sample).toBe(true)
    expect(heroStats({ runs: { k: { status: 'failed', result: null } as unknown as Run }, lastDoneKey: 'k' }).sample).toBe(true)
  })
})
