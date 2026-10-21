import type { BufferGate, CostKey, Place, Plan, ReturnWindow, TimelineStep } from '@/api/schemas'
import { restaurantName, stationLabel } from './format'
import { LOCATION_NAME } from './origin'
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
  /** walkHome：回程整段走路、後面沒有交通，緩衝的句子不能講「發車」 */
  buffer: { minutes: number; gate: BufferGate; window: ReturnWindow | null; walkHome: boolean } | null
  /** 交通這一步是公車或客運（換成公車圖示） */
  bus: boolean
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

function sentence(s: TimelineStep, plan: Plan, next: TimelineStep | undefined): string {
  switch (s.type) {
    case 'transit':
      return `搭${s.summary}到${s.to}，約 ${minutesBetween(s.depart_at, s.arrive_at)} 分鐘`
    case 'walk':
      return `走 ${s.minutes} 分鐘到${walkTarget(s, next)}${s.note ? `，${s.note}` : ''}`
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
      return `回到${s.place?.kind === 'location' ? s.station : stationLabel(s.station)}`
  }
}

/** 「搭車前先走到站牌」：緊接著搭車、地點也跟那段搭車一樣（都是出發的地方；規格書 6.5，2026-10-21） */
const isWalkToBoard = (s: TimelineStep, next: TimelineStep | undefined) =>
  s.type === 'walk' && next?.type === 'transit' && s.place != null && next.place?.kind === s.place.kind && next.place.id === s.place.id

/**
 * 步行要走到哪裡。通常 place 就是目的地（出發站統一叫「XX 站」）；
 * 但走到站牌的那一步，place 是出發的地方，目的地要用 to（站牌名稱）。
 */
function walkTarget(s: Extract<TimelineStep, { type: 'walk' }>, next: TimelineStep | undefined): string {
  if (isWalkToBoard(s, next)) return s.to ?? '站牌'
  return s.place ? placeName(s.place) : (s.to ?? '')
}

function title(s: TimelineStep, plan: Plan): string {
  if (s.place) return placeName(s.place)
  if (s.type === 'movie') return plan.movie.cinema
  if (s.type === 'meal' || s.type === 'wait') return restaurantName(plan.restaurant.name, plan.restaurant.cuisine_label)
  if (s.type === 'home') return s.station === LOCATION_NAME ? s.station : stationLabel(s.station)
  return (s.type === 'transit' ? s.from : s.to) ?? ''
}

/**
 * 這段交通是去程還是回程：在電影、用餐之前的是去程，之後的是回程。
 * 不能只看「第一段交通」：出發站就在商圈旁邊時，去程整段走路、沒有交通（規格書 6.5，2026-10-21）。
 */
export function transitLeg(timeline: TimelineStep[], i: number): 'go' | 'return' {
  const firstActivity = timeline.findIndex((s) => s.type === 'movie' || s.type === 'meal')
  return firstActivity < 0 || i < firstActivity ? 'go' : 'return'
}

const costOf = (plan: Plan, key: CostKey, amount: number) => ({ amount, estimated: plan.estimated.includes(key) })

/** 車資是 TDX 給的就不算估計；TDX 沒給、後端自己估的會列在 estimated（規格書 6.5） */
function cost(s: TimelineStep, plan: Plan, leg: 'go' | 'return'): StepView['cost'] {
  if (s.type === 'transit') return costOf(plan, leg === 'go' ? 'fare_go' : 'fare_return', s.fare_per_person)
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
      desc: sentence(s, plan, plan.timeline[i + 1]),
      place: s.place ?? null,
      cost: cost(s, plan, transitLeg(plan.timeline, i)),
      buffer:
        s.buffer_minutes != null && s.buffer_gate
          ? { minutes: s.buffer_minutes, gate: s.buffer_gate, window: s.return_window ?? null, walkHome: !plan.timeline.slice(i + 1).some((x) => x.type === 'transit') }
          : null,
      bus: s.type === 'transit' && /公車|客運/.test(s.summary),
    }
  })
}

/** 每一步的地點（去掉沒有地點的） */
export const timelinePlaces = (plan: Plan): Place[] => plan.timeline.flatMap((s) => (s.place ? [s.place] : []))
