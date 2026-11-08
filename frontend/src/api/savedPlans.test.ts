import { describe, expect, it } from 'vitest'
import type { Run } from './planRuns'
import { requestKey } from './planRuns'
import { benchmarkRequest } from '@/mocks/request'
import { mockResult } from '@/mocks/planResult'
import { JOB_ID_RE, localSavedPlan, shareStatus } from './savedPlans'

const ID = 'a'.repeat(32)
const result = mockResult(benchmarkRequest, false, ID)
const done = (finishedAt: number): Run => ({
  status: 'done', startedAt: finishedAt - 1000, position: null, stage: null, waitingQuota: false, waitSeconds: null,
  combinations: 1880, feasible: 39, result, error: null, finishedAt,
})

describe('分享編號', () => {
  it('只接受 32 碼小寫十六進位', () => {
    expect(JOB_ID_RE.test(ID)).toBe(true)
    expect(JOB_ID_RE.test('mock-job')).toBe(false)
    expect(JOB_ID_RE.test('A'.repeat(32))).toBe(false)
  })
})

describe('這台瀏覽器排過的結果先拿來用', () => {
  it('找得到同一個編號就組成分享頁要的格式', () => {
    const t = Date.parse('2026-11-08T10:00:00+08:00')
    const doc = localSavedPlan({ [requestKey(benchmarkRequest)]: done(t) }, ID)!
    expect(doc.request).toEqual(benchmarkRequest)
    expect(doc.result.job_id).toBe(ID)
    expect(doc.created_at).toBe(new Date(t).toISOString())
    expect(Date.parse(doc.expires_at) - t).toBe(7 * 86_400_000)
  })
  it('網址那把鑰匙壞掉就跳過，不丟錯', () => {
    const t = Date.parse('2026-11-08T10:00:00+08:00')
    const runs = { '{壞掉': done(t), [requestKey(benchmarkRequest)]: done(t) }
    expect(localSavedPlan(runs, ID)?.request).toEqual(benchmarkRequest)
    expect(localSavedPlan({ '{壞掉': done(t) }, ID)).toBeNull()
  })
  it('沒有這個編號、或還沒跑完，回 null', () => {
    expect(localSavedPlan({}, ID)).toBeNull()
    expect(localSavedPlan({ [requestKey(benchmarkRequest)]: { ...done(1), status: 'running', result: null } }, ID)).toBeNull()
  })
})

describe('分享頁過期了沒', () => {
  // 兩個方案：一個 17:00 出發、一個 18:00 出發；到期時間從出發時間算出來，不寫死日期
  const early = Date.parse('2026-11-08T17:00:00+08:00')
  const late = Date.parse('2026-11-08T18:00:00+08:00')
  const plans = [
    { ...result.plans[0], depart_at: new Date(early).toISOString() },
    { ...result.plans[1], depart_at: new Date(late).toISOString() },
  ]
  const doc = {
    job_id: ID, request: benchmarkRequest, result: { ...result, plans },
    created_at: new Date(early - 3_600_000).toISOString(), expires_at: new Date(early + 7 * 86_400_000).toISOString(),
  }
  const firstDepart = early
  const lastDepart = late
  it('還沒出發、也還沒到期：ok', () => {
    expect(shareStatus(doc, new Date(firstDepart - 60_000))).toBe('ok')
  })
  it('還有方案沒出發：ok', () => {
    expect(lastDepart).toBeGreaterThan(firstDepart)
    expect(shareStatus(doc, new Date(firstDepart + 1))).toBe('ok')
  })
  it('每個方案都出發過了：過期', () => {
    expect(shareStatus(doc, new Date(lastDepart))).toBe('expired')
  })
  it('超過 expires_at：過期', () => {
    const expires = new Date(firstDepart - 3_600_000)
    expect(shareStatus({ ...doc, expires_at: expires.toISOString() }, expires)).toBe('expired')
  })
})
