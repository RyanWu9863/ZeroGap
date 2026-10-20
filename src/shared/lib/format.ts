const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 2026-10-30 → 10/30（五）（決策 Q82） */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  return `${m}/${d}（${weekday}）`
}

/** 550 → $550；1000 → $1,000 */
export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`
}

/** 金額加上「約」：估計值一律標示（決策 Q24） */
export function formatCost(amount: number, isEstimated: boolean): string {
  return `${isEstimated ? '約 ' : ''}${formatMoney(amount)}`
}

/** 「中壢車站」「中壢站」「中壢」→「中壢站」：畫面統一用「XX 站」（TDX 的站名沒有「站」字） */
export function stationLabel(name: string): string {
  const n = name.replace(/車站$/, '站')
  return n.endsWith('站') ? n : `${n}站`
}

/** 步行分鐘換成生活化距離（一般人一分鐘約走 80 公尺，Q52）：12 → 約 1 公里、5 → 約 400 公尺 */
export function walkDistance(min: number): string {
  const m = min * 80
  return m >= 950 ? `約 ${Math.round(m / 100) / 10} 公里` : `約 ${Math.round(m / 50) * 50} 公尺`
}
