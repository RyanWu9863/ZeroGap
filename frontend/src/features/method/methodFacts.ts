import type { BufferGate, Plan, PlanResult, TimelineStep } from '@/api/schemas'

/*
 * 方法頁的真數字：從真後端的結果（第 1 個方案）讀出每一關的緩衝和花費。
 * 比喻：這是「抄錶」。不自己算，只把後端已經算好的數字照位置抄下來；
 * 那一關沒有數字就給 null，畫面就不顯示，不編。
 */

export type MethodFacts = {
  combinations: number
  feasible: number
  plans: number
  /** 第 1 個方案每道關卡的真數字；null＝這個方案沒有那一關的數字 */
  showtimeBuffer: number | null   // 走到影城後離開演還有幾分
  lastOrderBuffer: number | null  // 到餐廳後離最後點餐還有幾分
  walkMinutes: number | null      // 影城和餐廳之間走幾分
  returnBuffer: number | null     // 走到車站後離預定那班車還有幾分
  homeBuffer: number | null       // 到家時離最晚到家時間還有幾分
  costTotal: number               // 每人總花費
  costParts: { ticket: number; meal: number; fares: number }
  minBuffer: number               // 整趟最緊的一段
}

type WalkStep = Extract<TimelineStep, { type: 'walk' }>

const bufferAt = (plan: Plan, gate: BufferGate): number | null =>
  plan.timeline.find((s) => s.buffer_gate === gate)?.buffer_minutes ?? null

/** 影城和餐廳之間那一段走路：電影後面（或餐廳後面）的第一段走路 */
function walkBetween(plan: Plan): number | null {
  const t = plan.timeline
  const first = t.findIndex((s) => s.type === 'movie' || s.type === 'meal')
  if (first < 0) return null
  const walk = t.slice(first + 1).find((s): s is WalkStep => s.type === 'walk')
  return walk?.minutes ?? null
}

export function methodFacts(result: PlanResult): MethodFacts {
  const plan = result.plans[0]
  const c = plan.cost_per_person
  return {
    combinations: result.stats.combinations,
    feasible: result.stats.feasible,
    plans: result.plans.length,
    showtimeBuffer: bufferAt(plan, 'showtime'),
    lastOrderBuffer: bufferAt(plan, 'last_order'),
    walkMinutes: walkBetween(plan),
    returnBuffer: bufferAt(plan, 'return_trip'),
    homeBuffer: bufferAt(plan, 'latest_return'),
    costTotal: c.total,
    costParts: { ticket: c.ticket, meal: c.meal, fares: c.fare_go + c.fare_return },
    minBuffer: plan.min_buffer_minutes,
  }
}
