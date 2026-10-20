import type { BufferGate, CostKey, Place, Plan, ReturnWindow, TimelineStep } from '@/api/schemas'
import { stationLabel } from './format'
import { addMinutes, clockOn, minutesBetween } from './time'

/*
 * 時間軸每一步「怎麼念」（規格書 6.5 的結構化步驟 → 畫面上的一行字）。
 * 後端只給時間和地點，句子由前端組；數字一律照後端給的，不自己算行程。
 */
export type StepView = {
  key: string
  type: TimelineStep['type']
  /** 左欄的時刻（跨午夜會加「隔天」） */
  time: string
  /** 粗體那一行：地點名稱 */
  title: string
  desc: string
  place: Place | null
  cost: { amount: number; estimated: boolean } | null
  buffer: { minutes: number; gate: BufferGate; window: ReturnWindow | null } | null
}

const DURATION = { fast: '快速', normal: '一般', slow: '慢食' } as const

/** 地點名稱：出發站統一叫「XX 站」 */
export const placeName = (p: Place) => (p.kind === 'station' ? stationLabel(p.name) : p.name)

/** 每一步的開始和結束時間。候位沒有時間：接在上一步後面；萬一它是第一步，就往回推下一步的開始 */
function startEnd(s: TimelineStep, prevEnd: string | null, next: TimelineStep | undefined): [string, string] {
  switch (s.type) {
    case 'transit':
      return [s.depart_at, s.arrive_at]
    case 'walk':
      return [addMinutes(s.arrive_at, -s.minutes), s.arrive_at]
    case 'movie':
    case 'meal':
      return [s.starts_at, s.ends_at]
    case 'wait': {
      if (prevEnd) return [prevEnd, addMinutes(prevEnd, s.minutes)]
      const end = next && 'starts_at' in next ? next.starts_at : new Date().toISOString()
      return [addMinutes(end, -s.minutes), end]
    }
    case 'home':
      return [s.arrive_at, s.arrive_at]
  }
}

function sentence(s: TimelineStep, plan: Plan): string {
  switch (s.type) {
    case 'transit':
      return `搭${s.summary}到${s.to}，約 ${minutesBetween(s.depart_at, s.arrive_at)} 分鐘`
    case 'walk':
      return `走 ${s.minutes} 分鐘到${s.place ? placeName(s.place) : s.to}${s.note ? `，${s.note}` : ''}`
    case 'movie': {
      const m = plan.movie
      return `《${m.title}》${[m.hall_type_label, m.language, `片長 ${m.runtime_min} 分鐘`].filter(Boolean).join('・')}`
    }
    case 'wait':
      return `${s.note || '候位'}約 ${s.minutes} 分鐘`
    case 'meal': {
      const r = plan.restaurant
      const head = r.cuisine_label ? `${r.cuisine_label}・` : ''
      return `${head}${DURATION[s.duration]}用餐約 ${minutesBetween(s.starts_at, s.ends_at)} 分鐘${r.last_order ? `，最後點餐 ${r.last_order}` : ''}`
    }
    case 'home':
      return `回到${stationLabel(s.station)}`
  }
}

function title(s: TimelineStep, plan: Plan): string {
  if (s.place) return placeName(s.place)
  if (s.type === 'movie') return plan.movie.cinema
  if (s.type === 'meal' || s.type === 'wait') return plan.restaurant.name
  if (s.type === 'home') return stationLabel(s.station)
  return s.type === 'transit' ? s.from : s.to
}

const costOf = (plan: Plan, key: CostKey, amount: number) => ({ amount, estimated: plan.estimated.includes(key) })

function cost(s: TimelineStep, plan: Plan): StepView['cost'] {
  if (s.type === 'transit') return { amount: s.fare_per_person, estimated: false }
  if (s.type === 'movie') return costOf(plan, 'ticket', plan.cost_per_person.ticket)
  if (s.type === 'meal') return costOf(plan, 'meal', plan.cost_per_person.meal)
  return null
}

/** 整條時間軸 → 畫面用的步驟 */
export function describeTimeline(plan: Plan, date: string): StepView[] {
  let prevEnd: string | null = null
  return plan.timeline.map((s, i) => {
    const [start, end] = startEnd(s, prevEnd, plan.timeline[i + 1])
    prevEnd = end
    return {
      key: `${i}-${s.type}`,
      type: s.type,
      time: clockOn(start, date),
      title: title(s, plan),
      desc: sentence(s, plan),
      place: s.place ?? null,
      cost: cost(s, plan),
      buffer: s.buffer_minutes != null && s.buffer_gate ? { minutes: s.buffer_minutes, gate: s.buffer_gate, window: s.return_window ?? null } : null,
    }
  })
}

/** 每一步的地點（去掉沒有地點的） */
export const timelinePlaces = (plan: Plan): Place[] => plan.timeline.flatMap((s) => (s.place ? [s.place] : []))
