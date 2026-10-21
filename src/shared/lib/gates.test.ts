import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { gateLabels } from './gates'

describe('gates', () => {
  it('五道關卡帶入使用者條件', () => {
    const g = gateLabels(benchmarkRequest)
    expect(g).toHaveLength(5)
    expect(g[2].label).toBe('走路不超過 12 分')
    expect(g[4].label).toBe('每人不超過 $1,000')
  })
})
