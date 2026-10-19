import type { Proposal } from '@/api/schemas'

/**
 * 方案卡標籤（決策 Q16、Q60）：使用者畫面不出現「Jev」。
 * 後端有給 highlight 就用它；還沒給時，從 rank_label 拿掉 Jev 字樣當備用。
 */
export function planTag(p: Proposal): string {
  if (p.highlight) return p.highlight.label
  const tail = p.rank_label.split('・')[1]
  return tail ?? `第 ${p.rank} 選擇`
}

/** 第一名多一個「最推薦」 */
export function planBadge(p: Proposal): string | null {
  return p.rank === 1 ? '最推薦' : null
}

/** 桌機版排列：第一名放中間（抽牌感，Q20）→ 2、1、3 */
export function desktopOrder(plans: Proposal[]): Proposal[] {
  const byRank = [...plans].sort((a, b) => a.rank - b.rank)
  if (byRank.length < 3) return byRank
  return [byRank[1], byRank[0], byRank[2]]
}
