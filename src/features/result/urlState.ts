import { PlanRequest } from '@/api/schemas'
import { blankRequest } from '@/store/planStore'

/*
 * 條件 ↔ 網址（決策 Q62）。
 * 網址長這樣：/result?from=103&to=taoyuan&date=2026-10-30&t=17:00-23:00&food=japanese&budget=1000&walk=12&plan=2
 * 照後端規格書 6.4 存代碼和 id（from 是車站 id、to 是商圈代碼）；
 * 用目前位置出發時 from=here，座標不寫進網址，只存在這台瀏覽器（2026-10-21 使用者決定）；
 * 「不限」「幫我挑」（null）不寫進網址，讓網址短一點；?proto=、?mock= 這類其他參數原封不動。
 */
type Optional = [field: 'movie_id' | 'movie_genre' | 'hall_type' | 'language' | 'cuisine', key: string, kind: 'int' | 'str']
const OPTIONAL: Optional[] = [
  ['movie_id', 'movie', 'int'],
  ['movie_genre', 'genre', 'str'],
  ['hall_type', 'hall', 'str'],
  ['language', 'lang', 'str'],
  ['cuisine', 'food', 'str'],
]
/** diet、restaurant 是舊版（API.md）用的參數，一起清掉 */
const OURS = ['from', 'to', 'date', 't', 'order', 'budget', 'walk', 'plan', 'diet', 'restaurant', ...OPTIONAL.map((o) => o[1])]

/** 把條件和目前方案寫進網址參數（保留其他參數） */
export function writeRequest(params: URLSearchParams, r: PlanRequest, rank: number): URLSearchParams {
  const p = new URLSearchParams(params)
  OURS.forEach((k) => p.delete(k))
  p.set('from', r.origin_lat != null && r.origin_lng != null ? HERE : String(r.origin_station_id))
  p.set('to', r.area)
  p.set('date', r.date)
  p.set('t', `${r.earliest_departure}-${r.latest_home}`)
  if (r.order === 'meal_first') p.set('order', 'meal-first')
  for (const [field, key] of OPTIONAL) if (r[field] != null) p.set(key, String(r[field]))
  p.set('budget', String(r.budget_per_person))
  p.set('walk', String(r.max_walk_minutes))
  if (rank !== 1) p.set('plan', String(rank))
  return p
}

export const HERE = 'here'

type Here = { lat: number; lng: number } | null

/**
 * 網址是「從目前位置出發」，但這台瀏覽器沒有座標（例如別人傳來的連結）：
 * 回傳網址上的其他條件（出發點清空），讓使用者自己選出發點；不是這種情況回傳 null
 */
export function needsOrigin(params: URLSearchParams, here: Here): PlanRequest | null {
  if (params.get('from') !== HERE || here) return null
  const r = build(params, null)
  return r && { ...r, origin_station_id: 0, origin_lat: null, origin_lng: null }
}

/**
 * 從網址讀回條件；缺必要欄位或格式不對就回傳 null（改用瀏覽器暫存的條件）。
 * here：這台瀏覽器存的目前位置座標，from=here 時用它
 */
export function readRequest(params: URLSearchParams, here: Here = null): PlanRequest | null {
  const r = build(params, here)
  return r && PlanRequest.safeParse(r).success ? r : null
}

/** 照網址組出條件，還沒檢查格式 */
function build(params: URLSearchParams, here: Here): PlanRequest | null {
  const from = params.get('from')
  const to = params.get('to')
  const date = params.get('date')
  const [start, end] = (params.get('t') ?? '').split('-')
  if (!from || !to || !date || !start || !end) return null
  const r: PlanRequest = {
    ...blankRequest,
    ...(from === HERE
      ? { origin_station_id: null, origin_lat: here?.lat ?? null, origin_lng: here?.lng ?? null }
      : { origin_station_id: Number(from), origin_lat: null, origin_lng: null }),
    area: to,
    date,
    earliest_departure: start,
    latest_home: end,
    order: params.get('order') === 'meal-first' ? 'meal_first' : 'movie_first',
    budget_per_person: Number(params.get('budget')),
    max_walk_minutes: Number(params.get('walk')),
  }
  for (const [field, key, kind] of OPTIONAL) {
    const v = params.get(key)
    ;(r as Record<string, unknown>)[field] = v == null ? null : kind === 'int' ? Number(v) : v
  }
  return r
}

/** 網址上的方案編號（1–3），沒有就是 null */
export function readRank(params: URLSearchParams): number | null {
  const n = Number(params.get('plan') ?? 1)
  return [1, 2, 3].includes(n) ? n : null
}
