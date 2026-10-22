import type { Plan } from '@/api/schemas'

/**
 * 方案卡標籤（決策 Q16、Q60）：使用者畫面不出現「Jev」。
 * 後端的 highlight：第一名固定「最推薦」，第二、三名是最省、最穩、最早回到站、走最少路，也可能沒有（規格書 6.5）。
 */
export function planTag(p: Plan): string {
  return p.highlight?.label ?? `第 ${p.rank} 選擇`
}

/** 第一名多一個「最推薦」徽章；標籤本身已經是「最推薦」就不重複 */
export function planBadge(p: Plan): string | null {
  return p.rank === 1 && p.highlight?.key !== 'recommended' ? '最推薦' : null
}

/** 桌機版排列：第一名放中間（抽牌感，Q20）→ 2、1、3 */
export function desktopOrder(plans: Plan[]): Plan[] {
  const byRank = [...plans].sort((a, b) => a.rank - b.rank)
  if (byRank.length < 3) return byRank
  return [byRank[1], byRank[0], byRank[2]]
}
