/*
 * 日期小工具（計畫 P0-1）。日期一律用當地時間的 YYYY-MM-DD 字串，字串可以直接比大小。
 * 「今天」一律由呼叫的地方傳進來，函式本身不偷讀時鐘，方便測試。
 */

/** Date → 2026-10-30（當地時間） */
export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 今天的 YYYY-MM-DD */
export const todayISO = () => toISODate(new Date())

/** 2026-10-30 → 當地時間 00:00 的 Date（不用 new Date(iso)，那會被當成 UTC） */
export const fromISODate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 這一天已經過了嗎？（空字串不算） */
export const isPastDate = (date: string, today: string) => Boolean(date) && date < today

/** 今天（含）以後最近一個可選日；沒有就 null */
export function nearestAvailable(available: readonly string[], today: string): string | null {
  return [...available].sort().find((d) => d >= today) ?? null
}
