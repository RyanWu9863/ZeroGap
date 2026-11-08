import { describe, expect, it } from 'vitest'
import { alive, KEPT, planDots } from './funnelModel'

// 1,880 種組合，五關後剩 39 種（舊版假資料的數字，拿來測比例換算）
const total = 1880
const eliminated = [820, 610, 260, 101, 50]

describe('planDots：點數照真實剔除比例', () => {
  const p = planDots(total, eliminated)!

  it('每關剩下的點數遞減，對應真實剩下的組數', () => {
    expect(p.stages.map((s) => s.remaining)).toEqual([1060, 450, 190, 89, 39])
    expect(p.stages.map((s) => s.dots)).toEqual([68, 29, 12, 6, 2])
  })
  it('每個點的命運和每關點數一致', () => {
    for (let k = 0; k < 5; k++) expect(p.fate.filter((x) => alive(x, k + 1)).length).toBe(p.stages[k].dots)
    expect(p.fate.filter((x) => x === KEPT).length).toBe(2)
  })
  it('同一組資料每次結果一樣', () => {
    expect(planDots(total, eliminated)!.fate).toEqual(p.fate)
  })
  it('還有組合剩下時至少留 1 個點；全部淘汰時是 0', () => {
    expect(planDots(10000, [9990, 0, 0, 0, 5])!.stages.at(-1)!.dots).toBe(1)
    expect(planDots(100, [60, 40, 0, 0, 0])!.stages.at(-1)!.dots).toBe(0)
  })
  it('後端只給「全部 → 接得上」時當成一關（規格書 6.4 不給每關剔除數）', () => {
    const one = planDots(73038, [73038 - 1201])!
    expect(one.stages).toHaveLength(1)
    expect(one.fate.filter((x) => x === KEPT).length).toBe(one.stages[0].dots)
  })
  it('沒給剔除數 → null（畫面改用狀態式說明，不編數字）', () => {
    expect(planDots(1880, undefined)).toBeNull()
  })
})
