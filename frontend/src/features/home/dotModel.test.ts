import { describe, expect, it } from 'vitest'
import { dotCount, layoutDots, MAX_DOTS } from './dotModel'

const SAMPLE = { combinations: 73038, feasible: 1201, plans: 3 }

describe('dotCount', () => {
  it('照畫布大小算，但不超過上限', () => {
    expect(dotCount(360, 220, 5, MAX_DOTS.phone)).toBe(72 * 44)
    expect(dotCount(1200, 300, 5, MAX_DOTS.phone)).toBe(4000)
  })
  it('畫布太小時是 0', () => expect(dotCount(3, 3, 5, 100)).toBe(0))
})

describe('layoutDots', () => {
  it('組合比點多：每點代表多種組合，照真實比例留點', () => {
    const d = layoutDots(SAMPLE, 4000)
    expect(d.n).toBe(4000)
    expect(d.perDot).toBeCloseTo(73038 / 4000)
    expect(d.feasibleDots).toBe(Math.round((1201 / 73038) * 4000)) // 66
    expect(d.planDots).toBe(3)
    const count = (s: number) => d.stage.filter((x) => x === s).length
    expect(count(2)).toBe(3)
    expect(count(1)).toBe(d.feasibleDots - 3)
    expect(count(0)).toBe(4000 - d.feasibleDots)
  })

  it('真的有接得上的組合時，至少留下方案數那麼多點', () => {
    const d = layoutDots({ combinations: 1_000_000, feasible: 5, plans: 3 }, 1000)
    expect(d.feasibleDots).toBe(3)
    expect(d.planDots).toBe(3)
  })

  it('組合比點少：一點一種，點數就是組合數', () => {
    const d = layoutDots({ combinations: 40, feasible: 10, plans: 3 }, 4000)
    expect(d.n).toBe(40)
    expect(d.perDot).toBe(1)
    expect(d.feasibleDots).toBe(10)
  })

  it('沒有接得上的組合：沒有亮點', () => {
    const d = layoutDots({ combinations: 500, feasible: 0, plans: 0 }, 100)
    expect(d.feasibleDots).toBe(0)
    expect(d.planDots).toBe(0)
    expect(d.stage.every((x) => x === 0)).toBe(true)
  })

  it('同一組資料每次排出來一樣（重畫不換位置）', () => {
    expect(Array.from(layoutDots(SAMPLE, 500).stage)).toEqual(Array.from(layoutDots(SAMPLE, 500).stage))
  })

  it('組合數是 0 或點數是 0：空的', () => {
    expect(layoutDots({ combinations: 0, feasible: 0, plans: 0 }, 100).n).toBe(0)
    expect(layoutDots(SAMPLE, 0).n).toBe(0)
  })
})
