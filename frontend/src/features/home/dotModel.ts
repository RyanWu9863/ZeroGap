/*
 * 首頁點陣剪枝的資料模型（規格 4.2）。純函式，方便測試。
 * 一個點＝一種組合；組合太多時抽樣，一點代表 perDot 種。只有三層，因為後端只給這三個數字：
 * 全部組合 → 每段接得上（stats.feasible）→ 給你的方案（plans 數）。不編造五道關卡各自剔除幾組。
 */
export type DotStats = { combinations: number; feasible: number; plans: number }
export type DotLayout = { n: number; perDot: number; feasibleDots: number; planDots: number; stage: Uint8Array }

export const MAX_DOTS = { phone: 4000, desktop: 12000 } as const
export const PHONE_BREAKPOINT = 640

export function dotCount(width: number, height: number, gap: number, maxDots: number): number {
  if (gap <= 0) return 0
  return Math.max(0, Math.min(Math.floor(width / gap) * Math.floor(height / gap), maxDots))
}

/** 固定的「亂數」（線性同餘）：同一組資料每次排出來一樣 */
function shuffled(n: number, seed: number): Uint32Array {
  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  let s = seed >>> 0
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }
  return order
}

export function layoutDots(stats: DotStats, maxN: number, seed = 7): DotLayout {
  const n = Math.max(0, Math.min(maxN, stats.combinations))
  const stage = new Uint8Array(n)
  if (n === 0) return { n: 0, perDot: 0, feasibleDots: 0, planDots: 0, stage }
  const perDot = stats.combinations / n
  const planDots = Math.min(stats.plans, stats.feasible, n)
  // 照比例四捨五入；真的有接得上的組合時，至少留方案數那麼多點
  const feasibleDots = stats.feasible <= 0 ? 0 : Math.min(n, Math.max(planDots, 1, Math.round((stats.feasible / stats.combinations) * n)))
  const order = shuffled(n, seed)
  for (let k = 0; k < feasibleDots; k++) stage[order[k]] = k < planDots ? 2 : 1
  return { n, perDot, feasibleDots, planDots, stage }
}
