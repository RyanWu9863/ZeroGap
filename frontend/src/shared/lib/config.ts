/** 前端可調整的門檻都放這裡（決策 Q40、Q70）。只影響顯示，不影響行程可不可行。 */
export const BUFFER_LEVELS = {
  /** ≥ roomy 分鐘：寬鬆 */
  roomy: 30,
  /** ≥ snug 分鐘：剛好；低於就是偏緊 */
  snug: 10,
} as const

/** 出門到回到站少於幾小時，精靈就柔性提醒「可能排不出來」 */
export const MIN_COMFORT_HOURS = 4

/** 每人預算的選項（後端只要求正整數，選項由前端決定） */
export const BUDGET_OPTIONS = [500, 800, 1000, 1500, 2000] as const

/** 影城到餐廳的步行上限：後端只接受這幾個（規格書 6.4） */
export const WALK_OPTIONS = [5, 8, 12, 15, 20] as const

/** Jev 最高機率低於這個值就交給 LLM 代選（規格書 3.1）。前端只拿來顯示 */
export const JEV_THRESHOLD = 0.6

/**
 * 等後端回應最多幾毫秒（計畫 P1-2）；超過就顯示「等太久了」。
 * connect＝送出規劃到串流開始：後端先驗條件才開串流，給長一點。串流開始後就不限時（規劃本來就要 1～3 分鐘）
 */
export const API_TIMEOUT_MS = { connect: 30_000, default: 10_000 } as const
