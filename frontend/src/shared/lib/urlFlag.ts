/** 讀網址上的開關參數：?x=1 → true、?x=0 → false、沒寫 → null（沿用之前的狀態） */
export function urlFlag(name: string): boolean | null {
  const v = new URLSearchParams(window.location.search).get(name)
  if (v === '1') return true
  if (v === '0') return false
  return null
}
