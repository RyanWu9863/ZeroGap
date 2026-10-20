import type { PlanRequest } from '@/api/schemas'
import { homeLabel, homeMinutes, toHHMM, toMinutes } from '@/features/wizard/validation'
import { BUDGET_OPTIONS, WALK_OPTIONS } from '@/shared/lib/config'
import { formatMoney } from '@/shared/lib/format'

/*
 * 無解時的「放寬一級」（2026-10-20 決定）。
 * 後端的 NO_FEASIBLE 只給「各條件排除了幾組」（reasons），沒有算好的放寬建議，
 * 所以由前端依排除最多的條件排序，每個條件給一個「往寬鬆調一級」的一鍵重算按鈕。
 * 不顯示「放寬後可找到 N 組」：後端沒有這個數字。
 * reasons 的 key 規格書只舉了 last_train、budget，其他是推測，認不得的只列原因、不給按鈕。
 */
const LATEST = 26 * 60 // 隔天 02:00
const EARLIEST = 10 * 60

/** 被哪個條件排除 → 白話 */
export function reasonLabel(key: string, r: PlanRequest): string {
  switch (key) {
    case 'showtime':
      return '趕得上開演'
    case 'last_order':
    case 'opening_hours':
      return '趕得上點餐'
    case 'walk':
      return `走路不超過 ${r.max_walk_minutes} 分`
    case 'last_train':
    case 'return_trip':
      return '趕得上回程車'
    case 'latest_home':
      return `最晚 ${homeLabel(r.latest_home)} 回到出發站`
    case 'budget':
      return `每人不超過 ${formatMoney(r.budget_per_person)}`
    default:
      return key
  }
}

export type Relax = { label: string; patch: Partial<PlanRequest> }

/** 某個條件往寬鬆調一級；已經是最寬就回傳 null */
function relaxOne(key: string, r: PlanRequest): Relax | null {
  switch (key) {
    case 'budget': {
      const next = BUDGET_OPTIONS.find((v) => v > r.budget_per_person)
      return next ? { label: `每人預算改成 ${formatMoney(next)}`, patch: { budget_per_person: next } } : null
    }
    case 'walk': {
      const next = WALK_OPTIONS.find((v) => v > r.max_walk_minutes)
      return next ? { label: `步行上限改成 ${next} 分`, patch: { max_walk_minutes: next } } : null
    }
    case 'last_train':
    case 'return_trip':
    case 'latest_home': {
      const next = Math.min(homeMinutes(r.latest_home) + 60, LATEST)
      if (next <= homeMinutes(r.latest_home)) return null
      const v = toHHMM(next)
      return { label: `最晚回到站延後到 ${homeLabel(v)}`, patch: { latest_home: v } }
    }
    case 'showtime': {
      const next = Math.max(toMinutes(r.earliest_departure) - 60, EARLIEST)
      if (next >= toMinutes(r.earliest_departure)) return null
      const v = toHHMM(next)
      return { label: `最早出門提早到 ${v}`, patch: { earliest_departure: v } }
    }
    case 'last_order':
    case 'opening_hours':
      return r.cuisine ? { label: '料理改成不限', patch: { cuisine: null } } : null
    default:
      return null
  }
}

/** 依排除最多的條件排序：[原因, 排除幾組, 放寬按鈕]；按鈕最多 3 個 */
export function relaxPlan(reasons: Record<string, number>, r: PlanRequest) {
  const rows = Object.entries(reasons)
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => ({ key, label: reasonLabel(key, r), count }))
  const seen = new Set<string>()
  const buttons: Relax[] = []
  for (const row of rows) {
    const x = relaxOne(row.key, r)
    const id = x && Object.keys(x.patch).join()
    if (!x || seen.has(id!)) continue
    seen.add(id!)
    buttons.push(x)
    if (buttons.length === 3) break
  }
  return { rows, buttons }
}

/** NO_SHOWTIMES：有指定電影或片型、影廳、語言時，建議全部改回不限 */
export function relaxShowtimes(r: PlanRequest): Relax | null {
  if (r.movie_id == null && r.movie_genre == null && r.hall_type == null && r.language == null) return null
  return { label: r.movie_id != null ? '電影改成幫我挑，其他也不限' : '片型、影廳、語言都改成不限', patch: { movie_id: null, movie_genre: null, hall_type: null, language: null } }
}
