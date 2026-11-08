import type { Plan, TimelineStep } from '@/api/schemas'
import { durationLabel } from '@/features/wizard/validation'
import { restaurantName } from '@/shared/lib/format'
import { stepSpans } from '@/shared/lib/steps'
import { minutesBetween } from '@/shared/lib/time'

/*
 * 方案卡要顯示的重點，全部從後端回傳的方案整理出來（不另外算時間或金額，Q41）。
 * 「全程多久」只是把後端給的出門和回到家時間相減來顯示。
 */
export type PlanFacts = {
  movie: string
  theater: string
  /** Google 額度用完時沒有店名，改用料理類別（v0.10） */
  restaurant: string
  /** 例如「4 小時 48 分」 */
  duration: string
  /** 先看電影還是先吃 */
  order: '看完再吃' | '先吃再看'
}

export function planFacts(p: Plan): PlanFacts {
  const types = p.timeline.map((s) => s.type)
  return {
    movie: p.movie.title,
    theater: p.movie.cinema,
    restaurant: restaurantName(p.restaurant.name, p.restaurant.cuisine_label),
    duration: durationLabel(minutesBetween(p.depart_at, p.home_at)),
    order: types.indexOf('movie') < types.indexOf('meal') ? '看完再吃' : '先吃再看',
  }
}

export type RibbonSegment = { type: TimelineStep['type']; start: number; length: number }

/**
 * 時間軸緞帶：每一步佔全程的比例（0～1），用來畫每個方案自己的主視覺。
 * 每段從自己開始畫到下一步開始，中間的空檔算進這一段，加起來剛好是全程。
 */
export function ribbon(p: Plan): RibbonSegment[] {
  const spans = stepSpans(p)
  if (spans.length < 2) return []
  const t0 = spans[0].start
  const total = Math.max(minutesBetween(t0, spans.at(-1)!.start), 1)
  return spans.slice(0, -1).map((s, i) => ({
    type: s.type,
    start: minutesBetween(t0, s.start) / total,
    length: minutesBetween(s.start, spans[i + 1].start) / total,
  }))
}
