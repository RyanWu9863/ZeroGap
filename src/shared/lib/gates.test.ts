import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { gateLabels, relaxLabel, remainingAfter } from './gates'

describe('gates', () => {
  it('五道關卡帶入使用者條件', () => {
    const g = gateLabels(benchmarkRequest)
    expect(g).toHaveLength(5)
    expect(g[2].label).toBe('走路不超過 12 分')
    expect(g[4].label).toBe('每人不超過 $1,000')
  })
  it('剩餘組數：1880 過兩關剔除 820＋610 → 450；全部過完 → 39', () => {
    const e = [820, 610, 260, 101, 50]
    expect(remainingAfter(1880, e, 2)).toBe(450)
    expect(remainingAfter(1880, e, 5)).toBe(39)
    expect(remainingAfter(1880, undefined, 2)).toBeNull()
  })
  it('放寬建議白話', () => expect(relaxLabel('budget_per_person', 600)).toBe('每人預算改成 $600'))
})
