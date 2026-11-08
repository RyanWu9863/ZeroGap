import type { BufferGate, Plan, ReturnWindow, TimelineStep } from '@/api/schemas'
import { bufferSentence } from '@/shared/lib/buffer'
import { stepSpans } from '@/shared/lib/steps'
import { clock, clockOn } from '@/shared/lib/time'

/*
 * 結果頁的錶盤（規格 4.4）：出門到到家畫成一段 300 度的弧，從左下（-150 度）順時針到右下（+150 度），底下留缺口。
 * 角度 0＝12 點鐘、順時針為正。純函式，畫面（PlanDial）只負責畫。
 */
export const DIAL_START = -150
export const DIAL_SPAN = 300

export function angleAt(iso: string, departAt: string, homeAt: string): number {
  const t0 = Date.parse(departAt)
  const total = Date.parse(homeAt) - t0
  const f = total > 0 ? (Date.parse(iso) - t0) / total : 0
  return DIAL_START + DIAL_SPAN * Math.min(1, Math.max(0, f))
}

export type DialSegment = { index: number; type: TimelineStep['type']; a0: number; a1: number; start: string; end: string }

export function dialSegments(plan: Plan): DialSegment[] {
  return stepSpans(plan).flatMap((s, index) => {
    const a0 = angleAt(s.start, plan.depart_at, plan.home_at)
    const a1 = angleAt(s.end, plan.depart_at, plan.home_at)
    return a1 > a0 ? [{ index, type: s.type, a0, a1, start: s.start, end: s.end }] : []
  })
}

const HOUR = 3_600_000
export function dialTicks(plan: Plan): { angle: number; label: string }[] {
  const t0 = Date.parse(plan.depart_at)
  const t1 = Date.parse(plan.home_at)
  const ticks: { angle: number; label: string }[] = []
  // 台灣沒有日光節約時間，整點＝UTC 整點
  for (let t = Math.floor(t0 / HOUR) * HOUR + HOUR; t < t1; t += HOUR) {
    const iso = new Date(t).toISOString()
    ticks.push({ angle: angleAt(iso, plan.depart_at, plan.home_at), label: clock(iso) })
  }
  return ticks
}

export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p0 = polar(cx, cy, r, a0)
  const p1 = polar(cx, cy, r, a1)
  const large = a1 - a0 > 180 ? 1 : 0
  const f = (n: number) => Math.round(n * 100) / 100
  return `M ${f(p0.x)} ${f(p0.y)} A ${r} ${r} 0 ${large} 1 ${f(p1.x)} ${f(p1.y)}`
}

export type Bottleneck = { index: number; minutes: number; gate: BufferGate; window: ReturnWindow | null; walkHome: boolean; angle: number }

/** 最緊的一段：buffer_minutes 最小的一步（一樣小取最前面）；聚光燈打在那一步結束的地方 */
export function bottleneck(plan: Plan): Bottleneck | null {
  const spans = stepSpans(plan)
  let best: Bottleneck | null = null
  for (const [index, span] of spans.entries()) {
    const buf = span.buffer
    if (!buf || (best && buf.minutes >= best.minutes)) continue
    best = { index, ...buf, angle: angleAt(span.end, plan.depart_at, plan.home_at) }
  }
  return best
}

const later = (m: number) => `這一段只要再慢超過 ${m} 分鐘，`

export function bottleneckCopy(b: Bottleneck, stationName: string, date: string): { title: string; consequence: string } {
  const m = b.minutes
  switch (b.gate) {
    case 'showtime':
      return { title: `開演前只剩 ${m} 分`, consequence: `${later(m)}就趕不上電影開演。` }
    case 'last_order':
      return { title: `離最後點餐只剩 ${m} 分`, consequence: `${later(m)}餐廳就不能點餐了。` }
    case 'return_trip':
      return {
        title: bufferSentence('return_trip', m, stationName, b.window, b.walkHome),
        consequence: b.window
          ? `趕不上預定那班車的話，${clockOn(b.window.latest_depart_at, date)} 前還有車，只是會比較晚到家。`
          : b.walkHome
            ? `${later(m)}就沒辦法在你設的時間前走回${stationName}。`
            : `${later(m)}就趕不上預定那班回程車。`,
      }
    case 'latest_return':
      return { title: `比最晚回到${stationName}只早 ${m} 分`, consequence: `再慢超過 ${m} 分鐘，就可能趕不上末班車、超過你設的最晚到家時間。` }
  }
}
