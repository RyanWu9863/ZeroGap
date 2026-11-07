import { describe, expect, it } from 'vitest'
import { indexAt, nearestTurn, wheelLayout, wheelOffset, wheelPose } from './wheel'

describe('wheelLayout', () => {
  it('桌機寬度夠：三張並排，左右卡片和中央卡片不重疊', () => {
    const l = wheelLayout(1104)
    expect(l.mode).toBe('three')
    const centerRight = l.card / 2
    const sideLeft = l.step - (l.card * l.side) / 2
    expect(sideLeft).toBeGreaterThan(centerRight)
    expect(l.step + (l.card * l.side) / 2).toBeLessThanOrEqual(1104 / 2)
  })

  it('平板、手機：只放一張，左右只露出一條邊', () => {
    for (const w of [390, 810]) {
      const l = wheelLayout(w)
      expect(l.mode).toBe('peek')
      expect(l.card).toBeLessThanOrEqual(w - 2 * 12)
      const visible = w / 2 - (l.step - (l.card * l.side) / 2)
      expect(visible).toBeGreaterThan(0)
      expect(visible).toBeLessThanOrEqual(36)
    }
  })
})

describe('wheelOffset／nearestTurn', () => {
  it('三個方案會繞一圈：轉到第 0 格時，第 2 個方案在左邊', () => {
    expect(wheelOffset(0, 0, 3)).toBe(0)
    expect(wheelOffset(1, 0, 3)).toBe(1)
    expect(wheelOffset(2, 0, 3)).toBe(-1)
    expect(wheelOffset(0, 3, 3)).toBe(0)
  })

  it('兩個方案不繞圈', () => {
    expect(wheelOffset(1, 0, 2)).toBe(1)
    expect(nearestTurn(5, 1, 2)).toBe(1)
  })

  it('換方案走最短的方向，可以一直往同一邊轉', () => {
    expect(nearestTurn(0, 2, 3)).toBe(-1)
    expect(nearestTurn(2, 0, 3)).toBe(3)
    expect(indexAt(-1, 3)).toBe(2)
    expect(indexAt(3, 3)).toBe(0)
  })
})

describe('wheelPose', () => {
  const l = wheelLayout(1104)
  it('中央最大、最上層；左右對稱縮小、朝中央轉', () => {
    const c = wheelPose(0, l)
    const r = wheelPose(1, l)
    const left = wheelPose(-1, l)
    expect(c).toMatchObject({ x: 0, scale: 1, rotateY: 0, opacity: 1 })
    expect(r.x).toBeCloseTo(l.step)
    expect(left.x).toBeCloseTo(-l.step)
    expect(r.scale).toBeCloseTo(l.side)
    expect(r.rotateY).toBeCloseTo(-left.rotateY)
    expect(c.zIndex).toBeGreaterThan(r.zIndex)
  })

  it('轉到背面時看不到、在最底層', () => {
    const back = wheelPose(1.5, l)
    expect(back.opacity).toBe(0)
    expect(Math.abs(back.x)).toBeLessThan(1)
    expect(back.zIndex).toBeLessThan(wheelPose(1, l).zIndex)
  })
})
