import type { Place, Plan, PlanRequest, PlanResult } from '@/api/schemas'
import { stations } from './catalog'

/*
 * 開發用假資料（不是真實查詢結果）：POST /api/plans 的 result 事件（格式照後端規格書 v0.13 第 6.5 節）。
 * 時間都放在使用者選的那一天；數字照規格書的算法湊過，緩衝、花費、特色標籤彼此對得上：
 *   開演前 15 分要到、候位 10 分、快速用餐 45 分、回程最晚 22:28 要離開、最晚 23:00 回到站。
 * 第 1、2 案的餐廳是 Google 來源（只有 place_id），第 3 案是 OSM 來源（有座標），兩種顯示都看得到；
 * 第 3 案的營業時間沒核對過（hours_verified: false），看得到「請向店家確認」的提示。
 */
const KATSUYA: Place = { kind: 'restaurant', id: 7, name: '吉豚屋', place_id: 'mock-place-katsuya' }
const FUKUSHO: Place = { kind: 'restaurant', id: 9, name: '福勝亭', lat: 24.9905, lng: 121.3122 }
const HUB: Place = { kind: 'hub', id: 1, name: '桃園站', lat: 24.989, lng: 121.314 }
const CINEMA: Place = { kind: 'cinema', id: 3, name: '桃園統領威秀', lat: 24.9918, lng: 121.3131 }

const MADOKA: Plan['movie'] = { id: 12, title: '劇場版 魔法少女小圓', genre: 'animation', genre_label: '動畫', runtime_min: 119, cinema: '桃園統領威秀', chain: 'vieshow', hall_type: 'standard', hall_type_label: '一般數位', language: '日語' }
const SINNER: Plan['movie'] = { ...MADOKA, id: 15, title: '不存在的罪人', genre: 'drama', genre_label: '劇情', runtime_min: 105, language: '中文' }
const katsuya: Plan['restaurant'] = { id: 7, name: '吉豚屋', cuisine: 'japanese', cuisine_label: '日式', address: '桃園市桃園區（示意地址）', price_range: 'under_200', last_order: '21:00', source: 'google', place_id: 'mock-place-katsuya', hours_verified: true }
const fukusho: Plan['restaurant'] = { id: 9, name: '福勝亭', cuisine: 'japanese', cuisine_label: '日式', address: '桃園市桃園區（示意地址）', price_range: '200_500', last_order: '20:30', source: 'osm', place_id: null, hours_verified: false }

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const diff = (a: string, b: string) => toMin(b) - toMin(a)

type Spec = {
  movie: Plan['movie']
  /** 開演 */
  show: string
  ticket: number
  restaurant: Plan['restaurant']
  place: Place
  walkToFood: number
  /** 開始用餐 */
  meal: string
  walkBack: number
  /** 回程那班車：出發、抵達 */
  train: [string, string]
}

function build(date: string, origin: Place, s: Spec, rank: number, highlight: Plan['highlight']): Plan {
  const at = (hhmm: string) => `${date}T${hhmm}:00+08:00`
  const showEnd = toHm(toMin(s.show) + s.movie.runtime_min)
  const mealEnd = toHm(toMin(s.meal) + 45)
  const atHub = toHm(toMin(mealEnd) + s.walkBack)
  const buffers = { show: diff('17:30', toHm(toMin(s.show) - 15)), food: diff(s.meal, s.restaurant.last_order!), back: diff(atHub, '22:28'), home: diff(s.train[1], '23:00') }
  const meal = s.restaurant.price_range === 'under_200' ? 150 : 350
  return {
    rank,
    highlight,
    score: 0,
    probabilities: { movie: 0.71, restaurant: 0.64 },
    decided_by: { movie: 'jev', restaurant: 'jev', route_go: 'jev', route_return: 'jev' },
    depart_at: at('17:05'),
    home_at: at(s.train[1]),
    minutes_before_deadline: buffers.home,
    min_buffer_minutes: Math.min(buffers.show, buffers.food, buffers.back),
    movie: s.movie,
    restaurant: s.restaurant,
    timeline: [
      { type: 'transit', from: origin.name, to: '桃園', summary: '台鐵 區間車', depart_at: at('17:05'), arrive_at: at('17:25'), fare_per_person: 25, place: origin },
      { type: 'walk', from: '桃園站', to: '影城', minutes: 5, arrive_at: at('17:30'), note: '取票', place: CINEMA, buffer_minutes: buffers.show, buffer_gate: 'showtime' },
      { type: 'movie', starts_at: at(s.show), ends_at: at(showEnd), place: CINEMA },
      { type: 'walk', from: '影城', to: '餐廳', minutes: s.walkToFood, arrive_at: at(toHm(toMin(s.meal) - 10)), place: s.place },
      { type: 'wait', minutes: 10, note: '候位', place: s.place, buffer_minutes: buffers.food, buffer_gate: 'last_order' },
      { type: 'meal', starts_at: at(s.meal), ends_at: at(mealEnd), duration: 'fast', place: s.place },
      {
        type: 'walk', from: '餐廳', to: '桃園站', minutes: s.walkBack, arrive_at: at(atHub), place: HUB, buffer_minutes: buffers.back, buffer_gate: 'return_trip',
        return_window: { planned_depart_at: at(s.train[0]), minutes_to_planned: diff(atHub, s.train[0]), latest_depart_at: at('22:28'), minutes_to_latest: buffers.back },
      },
      { type: 'transit', from: '桃園', to: origin.name, summary: '台鐵 區間車', depart_at: at(s.train[0]), arrive_at: at(s.train[1]), fare_per_person: 25, place: HUB },
      { type: 'home', station: origin.name, arrive_at: at(s.train[1]), place: origin, buffer_minutes: buffers.home, buffer_gate: 'latest_return' },
    ],
    cost_per_person: { ticket: s.ticket, meal, fare_go: 25, fare_return: 25, total: s.ticket + meal + 50 },
    estimated: ['ticket', 'meal'],
    alternatives: {},
  }
}

export function mockResult(req: PlanRequest, lowConfidence: boolean): PlanResult {
  const st = stations.find((s) => s.id === req.origin_station_id) ?? stations[2]
  const origin: Place = { kind: 'station', id: st.id, name: st.name, lat: 24.9537, lng: 121.2257 }
  const d = req.date
  const at = (hhmm: string) => `${d}T${hhmm}:00+08:00`
  // 最推薦；最穩（最緊 15 分）；最早回到站（21:06）——三案的數字讓特色標籤照規格書的規則分得出來
  const p1 = build(d, origin, { movie: MADOKA, show: '17:55', ticket: 350, restaurant: katsuya, place: KATSUYA, walkToFood: 3, meal: '20:07', walkBack: 5, train: ['21:05', '21:25'] }, 1, { key: 'recommended', label: '最推薦', reason: '最符合你選的條件' })
  const p2 = build(d, origin, { movie: { ...SINNER, hall_type: 'imax', hall_type_label: 'IMAX' }, show: '18:00', ticket: 440, restaurant: katsuya, place: KATSUYA, walkToFood: 3, meal: '19:58', walkBack: 5, train: ['21:00', '21:20'] }, 2, { key: 'safest', label: '最穩', reason: '最緊的一段也還有 15 分鐘' })
  const p3 = build(d, origin, { movie: SINNER, show: '17:50', ticket: 350, restaurant: fukusho, place: FUKUSHO, walkToFood: 4, meal: '19:49', walkBack: 6, train: ['20:46', '21:06'] }, 3, { key: 'earliest_return', label: '最早回到站', reason: `21:06 就回到${st.name}站，比最晚時間早 114 分` })
  p2.probabilities = { movie: 0.21, restaurant: 0.64 }
  p3.probabilities = { movie: 0.21, restaurant: 0.3 }

  if (lowConfidence) {
    // 第 1 案：餐廳（和沒指定時的電影）由 LLM 代選，備選只有估計值
    p1.probabilities = { movie: 0.41, restaurant: 0.44 }
    p1.decided_by = { ...p1.decided_by, restaurant: 'llm', movie: req.movie_id == null ? 'llm' : 'jev' }
    p1.alternatives = {
      restaurant: [
        { restaurant_id: 9, name: '福勝亭', cuisine: 'japanese', probability: 0.31, home_at: at('21:40'), cost_per_person_total: 750, estimated: true },
        // Google 額度用完時備選沒有店名，畫面改顯示料理類別（v0.10）
        { restaurant_id: 11, name: null, cuisine: 'western', probability: 0.12, home_at: at('21:52'), cost_per_person_total: 950, estimated: true },
      ],
      ...(req.movie_id == null
        ? {
            movie: [
              // 換這部片的話，搭配的餐廳也不同（v0.11：restaurant_* 有值）
              { movie_id: 15, title: '不存在的罪人', probability: 0.33, home_at: at('21:10'), cost_per_person_total: 650, estimated: true, restaurant_id: 9, restaurant_name: '福勝亭', restaurant_cuisine: 'japanese' },
              { movie_id: 16, title: '示意電影 C', probability: 0.18, home_at: at('21:35'), cost_per_person_total: 560, estimated: true, restaurant_id: null, restaurant_name: null, restaurant_cuisine: null },
            ],
          }
        : {}),
    }
    // 第 2 案：回程路線由 LLM 代選，另外兩條是 TDX 的精確值
    p2.decided_by = { ...p2.decided_by, route_return: 'llm' }
    p2.alternatives = {
      route_return: [
        { summary: '台鐵 區間車', depart_at: at('21:15'), arrive_at: at('21:35'), fare_per_person: 25, probability: 0.31 },
        { summary: '公車（示意）', depart_at: at('21:08'), arrive_at: at('21:52'), fare_per_person: 30, probability: 0.22 },
      ],
    }
  }
  const plans = [p1, p2, p3]
  for (const p of plans) {
    if (req.movie_id != null) p.probabilities.movie = 1 // 指定電影時選片機率當作 1（規格書 6.5）
    p.score = Math.round((p.probabilities.movie ?? 1) * (p.probabilities.restaurant ?? 1) * 100) / 100
  }
  return { job_id: 'mock-job', restaurant_source: 'google', stats: { combinations: 1880, feasible: 39 }, plans }
}
