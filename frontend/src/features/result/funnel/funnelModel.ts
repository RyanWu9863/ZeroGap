/*
 * 漏斗點陣的資料模型（沉浸式新版 PR2）。純函式，方便測試。
 * 一個點代表「全部組合 ÷ 點數」組，每道關卡依「真實的剔除數」比例拿掉點。
 * 後端只給「全部組合 → 接得上」兩個數字（規格書 6.4），呼叫的地方把它當成一關傳進來；沒給就回傳 null。
 */

/** 點的命運：0～4＝在第幾道關卡被淘汰（0 起算），KEPT＝每段都接得上 */
export const KEPT = -1

export type DotPlan = { fate: number[]; perDot: number; stages: { remaining: number; dots: number }[] }

/** 固定的「亂數」：同一組資料每次排出來都一樣，不會每次重畫就換位置 */
function shuffle(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i)
  let seed = 7
  for (let i = n - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280
    const j = Math.floor((seed / 233280) * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/**
 * total＝全部組合，eliminated＝每關剔除數（照關卡順序），n＝要畫幾個點。
 * 每關剩下的點數照真實比例四捨五入；只要真的還有組合剩下，至少留 1 個點，免得「還有 39 組」卻一個點都不剩。
 */
export function planDots(total: number, eliminated: number[] | undefined, n = 120): DotPlan | null {
  if (!eliminated || total <= 0) return null
  let remaining = total
  let prevDots = n
  const stages = eliminated.map((e) => {
    remaining -= e
    const dots = remaining <= 0 ? 0 : Math.min(prevDots, Math.max(1, Math.round((remaining / total) * n)))
    prevDots = dots
    return { remaining: Math.max(remaining, 0), dots }
  })
  const fate: number[] = new Array(n).fill(KEPT)
  const order = shuffle(n)
  let cursor = 0
  let before = n
  stages.forEach((s, gate) => {
    for (let k = 0; k < before - s.dots; k++) fate[order[cursor++]] = gate
    before = s.dots
  })
  return { fate, perDot: total / n, stages }
}

/** 過了前 k 關以後，這個點還在不在 */
export const alive = (fate: number, k: number) => fate === KEPT || fate >= k
