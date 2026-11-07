import { describe, expect, it } from 'vitest'
import type { Run } from '@/api/planRuns'
import { funnelHeadline, quotaText, queueText } from './funnelCopy'

const run = (p: Partial<Run>): Run => ({
  status: 'running', startedAt: 0, position: null, stage: null, waitingQuota: false, waitSeconds: null,
  combinations: null, feasible: null, result: null, error: null, finishedAt: null, ...p,
})

describe('排隊', () => {
  it('前面還有幾個人＝順位減 1', () => expect(queueText(3)).toBe('前面還有 2 個人'))
  it('第 1 位：下一個就輪到你', () => expect(queueText(1)).toBe('下一個就輪到你'))
})
describe('交通查詢等候', () => {
  it('有秒數就寫約幾秒（無條件進位）', () => expect(quotaText(12.2)).toBe('交通資料查詢中，約 13 秒'))
  it('沒有秒數就不寫', () => expect(quotaText(null)).toBe('交通資料查詢中，請稍等'))
})
describe('漏斗上方那一行（也是螢幕閱讀器念的）', () => {
  it('還沒連上', () => expect(funnelHeadline(undefined)).toBe('正在送出條件…'))
  it('排隊中', () => expect(funnelHeadline(run({ status: 'queued', position: 2 }))).toBe('排隊中，前面還有 1 個人'))
  it('等交通查詢', () => expect(funnelHeadline(run({ stage: 'routing', waitingQuota: true, waitSeconds: 5 }))).toBe('交通資料查詢中，約 5 秒'))
  it('一般階段念階段名稱', () => expect(funnelHeadline(run({ stage: 'filtering' }))).toBe('篩出每一段都接得上的組合…'))
  it('多想一下的階段併進「挑出最適合你的 3 個」', () => expect(funnelHeadline(run({ stage: 'llm_fallback' }))).toBe('挑出最適合你的 3 個…'))
  it('完成', () => expect(funnelHeadline(run({ status: 'done' }))).toBe('每一段都檢查完了'))
  it('排不出來', () => expect(funnelHeadline(run({ status: 'failed' }))).toBe('這組條件排不出來'))
})
