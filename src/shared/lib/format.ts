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

/** 「中壢站」→「中壢站」；「中壢車站」→「中壢站」：畫面統一用「XX 站」 */
export function stationLabel(name: string): string {
  return name.replace(/車站$/, '站')
}
