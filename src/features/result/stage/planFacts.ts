import type { Proposal, TimelineStep } from '@/api/schemas'
import { durationLabel, toMinutes } from '@/features/wizard/validation'

/*
 * 方案卡要顯示的重點，全部從後端回傳的方案整理出來（不另外算時間或金額，Q41）。
 * 「全程多久」只是把後端給的出門和回到站時間相減來顯示。
 */
export type PlanFacts = {
  movie: string | null
  theater: string | null
  restaurant: string | null
  /** 例如「4 小時 48 分」 */
  duration: string
  /** 先看電影還是先吃 */
  order: '看完再吃' | '先吃再看'
}

export function planFacts(p: Proposal): PlanFacts {
  const steps = p.timeline_steps
  const movieStep = steps.find((s) => s.type === '電影')
  const types = steps.map((s) => s.type)
  return {
    movie: movieStep?.desc.match(/《(.+?)》/)?.[1] ?? null,
    theater: steps.find((s) => s.place?.kind === 'theater')?.place?.name ?? null,
    restaurant: steps.find((s) => s.place?.kind === 'restaurant')?.place?.name ?? null,
    duration: durationLabel(toMinutes(p.summary.return_time) - toMinutes(p.summary.departure_time)),
    order: types.indexOf('電影') < types.indexOf('晚餐') ? '看完再吃' : '先吃再看',
  }
}

export type RibbonSegment = { type: TimelineStep['type']; start: number; length: number }

/** 時間軸緞帶：每一步到下一步佔全程的比例（0～1），用來畫每個方案自己的主視覺 */
export function ribbon(p: Proposal): RibbonSegment[] {
  const steps = p.timeline_steps
  const t0 = toMinutes(steps[0].time)
  const span = Math.max(toMinutes(steps.at(-1)!.time) - t0, 1)
  return steps.slice(0, -1).map((s, i) => ({
    type: s.type,
    start: (toMinutes(s.time) - t0) / span,
    length: (toMinutes(steps[i + 1].time) - toMinutes(s.time)) / span,
  }))
}
