import { ItineraryRequest, PICK_FOR_ME } from '@/api/schemas'
import { blankRequest } from '@/store/planStore'

/*
 * 條件 ↔ 網址（決策 Q62）。
 * 網址長這樣：/result?from=中壢站&to=桃園區&date=2026-10-30&t=17:00-23:00&budget=1000&walk=12&plan=2
 * 預設值（不限、沒有、幫我挑）不寫進網址，讓網址短一點；?proto=、?mock= 這類其他參數原封不動。
 */
const OPTIONAL: [keyof ItineraryRequest, string, string][] = [
  ['movie_title', 'movie', PICK_FOR_ME],
  ['movie_genre', 'genre', '不限'],
  ['theater_type', 'hall', '不限'],
  ['language', 'lang', '不限'],
  ['cuisine_type', 'food', '不限'],
  ['dietary_restriction', 'diet', '沒有'],
]
const OURS = ['from', 'to', 'date', 't', 'order', 'budget', 'walk', 'plan', 'restaurant', ...OPTIONAL.map((o) => o[1])]

/** 把條件和目前方案寫進網址參數（保留其他參數） */
export function writeRequest(params: URLSearchParams, r: ItineraryRequest, rank: number): URLSearchParams {
  const p = new URLSearchParams(params)
  OURS.forEach((k) => p.delete(k))
  p.set('from', r.origin_station)
  p.set('to', r.district_hub)
  p.set('date', r.date)
  p.set('t', `${r.earliest_departure}-${r.latest_return}`)
  if (r.dining_order === '先吃再看') p.set('order', 'eat-first')
  for (const [field, key, dflt] of OPTIONAL) if (r[field] && r[field] !== dflt) p.set(key, String(r[field]))
  if (r.restaurant_name) p.set('restaurant', r.restaurant_name)
  p.set('budget', String(r.budget_per_person))
  p.set('walk', String(r.max_walk_minutes))
  if (rank !== 1) p.set('plan', String(rank))
  return p
}

/** 從網址讀回條件；缺必要欄位或格式不對就回傳 null（改用瀏覽器暫存的條件） */
export function readRequest(params: URLSearchParams): ItineraryRequest | null {
  const from = params.get('from')
  const to = params.get('to')
  const date = params.get('date')
  const [start, end] = (params.get('t') ?? '').split('-')
  if (!from || !to || !date || !start || !end) return null
  const r: ItineraryRequest = {
    ...blankRequest,
    origin_station: from,
    district_hub: to,
    date,
    earliest_departure: start,
    latest_return: end,
    dining_order: params.get('order') === 'eat-first' ? '先吃再看' : '看完電影再吃',
    budget_per_person: Number(params.get('budget')),
    max_walk_minutes: Number(params.get('walk')),
  }
  for (const [field, key, dflt] of OPTIONAL) (r as Record<string, unknown>)[field] = params.get(key) ?? dflt
  const restaurant = params.get('restaurant')
  if (restaurant) r.restaurant_name = restaurant
  return ItineraryRequest.safeParse(r).success ? r : null
}

/** 網址上的方案編號（1–3），沒有就是 null */
export function readRank(params: URLSearchParams): number | null {
  const n = Number(params.get('plan') ?? 1)
  return [1, 2, 3].includes(n) ? n : null
}
