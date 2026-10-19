/** 前端可調整的門檻都放這裡（決策 Q40、Q70）。只影響顯示，不影響行程可不可行。 */
export const BUFFER_LEVELS = {
  /** ≥ roomy 分鐘：寬鬆 */
  roomy: 30,
  /** ≥ snug 分鐘：剛好；低於就是偏緊 */
  snug: 10,
} as const

/** 出門到回到站少於幾小時，精靈就柔性提醒「可能排不出來」 */
export const MIN_COMFORT_HOURS = 4
