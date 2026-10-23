import type { ItineraryResponse, Proposal, TimelineStep } from '@/api/schemas'
import { itineraryOk } from './itineraryOk'

/*
 * 介紹頁情境卡 ②③ 的假資料（不是真實查詢結果，數字是示意值）。
 * 以前不管條件都回傳同一組（17:15 出發、看完再吃、$550），
 * 「週末午後，先吃再看」會排出晚上先看電影、「小資之夜」會超過 $500 預算，簡報時對不上條件。
 * 每一步的時間、緩衝、花費都手算對過；後端完成後換成錄製的真實回應。
 */

const STATION_ZL = { name: '中壢車站', kind: 'station' as const }
const STATION_TY = { name: '桃園車站', kind: 'station' as const }
const VIESHOW = { name: '桃園統領威秀', kind: 'theater' as const }
const KATSUYA = { name: '吉豚屋', kind: 'restaurant' as const }
const FUKUSHO = { name: '福勝亭', kind: 'restaurant' as const }

const step = (s: TimelineStep): TimelineStep => s
const transit = (amount: number) => ({ amount, is_estimated: false })
const estimated = (amount: number) => ({ amount, is_estimated: true })

/* ── 情境 ②：週末午後，先吃再看（12:00–18:00・每人 $800） ── */

const w1: Proposal = {
  rank: 1,
  rank_label: 'Jev首選・最省',
  highlight: { key: 'cheapest', label: '最省', reason: '每人 $560，三個方案中最便宜' },
  confidence_breakdown: { movie_prob: 0.18, restaurant_prob: 0.46, combined: 0.08 },
  summary: { departure_time: '12:10', return_time: '17:03', early_return_buffer_minutes: 57, min_buffer_minutes: 13, total_cost_per_person: 560 },
  cost_breakdown: { movie_ticket: estimated(300), dining: estimated(210), transit_outbound: transit(25), transit_inbound: transit(25) },
  timeline_steps: [
    step({ time: '12:10', type: '交通', desc: '中壢站搭台鐵到桃園站，約 25 分鐘', place: STATION_ZL, cost_item: 'transit_outbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '12:35', type: '步行', desc: '走 4 分鐘到吉豚屋，候位約 10 分鐘', place: KATSUYA, cost_item: null, buffer_minutes: null, buffer_gate: null }),
    step({ time: '12:49', type: '晚餐', desc: '吉豚屋（日式）午餐約 62 分鐘', place: KATSUYA, cost_item: 'dining', buffer_minutes: null, buffer_gate: null }),
    step({ time: '13:51', type: '步行', desc: '吃完走 3 分鐘到桃園統領威秀，取票', place: VIESHOW, cost_item: null, buffer_minutes: 26, buffer_gate: 'showtime' }),
    step({ time: '14:20', type: '電影', desc: '《劇場版 魔法少女小圓》片長 119 分鐘', place: VIESHOW, cost_item: 'movie_ticket', buffer_minutes: null, buffer_gate: null }),
    step({ time: '16:19', type: '步行', desc: '散場後走 6 分鐘回桃園站', place: STATION_TY, cost_item: null, buffer_minutes: 13, buffer_gate: 'return_trip' }),
    step({ time: '16:38', type: '交通', desc: '桃園站搭台鐵回中壢，約 25 分鐘', place: STATION_TY, cost_item: 'transit_inbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '17:03', type: '到家', desc: '回到中壢站', place: STATION_ZL, cost_item: null, buffer_minutes: 57, buffer_gate: 'latest_return' }),
  ],
  refs: { showtime_id: 121, restaurant_id: 7, outbound_trip_id: 5402, inbound_trip_id: 5611 },
}

const w2: Proposal = {
  rank: 2,
  rank_label: 'Jev第二選擇・最穩',
  highlight: { key: 'safest', label: '最穩', reason: '每一段都留 15 分鐘以上的餘裕' },
  confidence_breakdown: { movie_prob: 0.22, restaurant_prob: 0.46, combined: 0.1 },
  summary: { departure_time: '12:20', return_time: '17:03', early_return_buffer_minutes: 57, min_buffer_minutes: 17, total_cost_per_person: 590 },
  cost_breakdown: { movie_ticket: estimated(330), dining: estimated(210), transit_outbound: transit(25), transit_inbound: transit(25) },
  timeline_steps: [
    step({ time: '12:20', type: '交通', desc: '中壢站搭台鐵到桃園站，約 25 分鐘', place: STATION_ZL, cost_item: 'transit_outbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '12:45', type: '步行', desc: '走 4 分鐘到吉豚屋，候位約 10 分鐘', place: KATSUYA, cost_item: null, buffer_minutes: null, buffer_gate: null }),
    step({ time: '12:59', type: '晚餐', desc: '吉豚屋（日式）午餐約 62 分鐘', place: KATSUYA, cost_item: 'dining', buffer_minutes: null, buffer_gate: null }),
    step({ time: '14:01', type: '步行', desc: '吃完走 3 分鐘到桃園統領威秀，取票', place: VIESHOW, cost_item: null, buffer_minutes: 26, buffer_gate: 'showtime' }),
    step({ time: '14:30', type: '電影', desc: '《不存在的罪人》片長 105 分鐘', place: VIESHOW, cost_item: 'movie_ticket', buffer_minutes: null, buffer_gate: null }),
    step({ time: '16:15', type: '步行', desc: '散場後走 6 分鐘回桃園站', place: STATION_TY, cost_item: null, buffer_minutes: 17, buffer_gate: 'return_trip' }),
    step({ time: '16:38', type: '交通', desc: '桃園站搭台鐵回中壢，約 25 分鐘', place: STATION_TY, cost_item: 'transit_inbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '17:03', type: '到家', desc: '回到中壢站', place: STATION_ZL, cost_item: null, buffer_minutes: 57, buffer_gate: 'latest_return' }),
  ],
  refs: { showtime_id: 124, restaurant_id: 7, outbound_trip_id: 5404, inbound_trip_id: 5611 },
}

const w3: Proposal = {
  rank: 3,
  rank_label: 'Jev第三選擇',
  highlight: { key: 'earliest_return', label: '最早回到站', reason: '16:05 就回到中壢站，比最晚時間早 115 分' },
  confidence_breakdown: { movie_prob: 0.22, restaurant_prob: 0.38, combined: 0.08 },
  summary: { departure_time: '12:00', return_time: '16:05', early_return_buffer_minutes: 115, min_buffer_minutes: 9, total_cost_per_person: 630 },
  cost_breakdown: { movie_ticket: estimated(330), dining: { amount: 250, is_estimated: false }, transit_outbound: transit(25), transit_inbound: transit(25) },
  timeline_steps: [
    step({ time: '12:00', type: '交通', desc: '中壢站搭台鐵到桃園站，約 25 分鐘', place: STATION_ZL, cost_item: 'transit_outbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '12:25', type: '步行', desc: '走 4 分鐘到福勝亭，候位約 8 分鐘', place: FUKUSHO, cost_item: null, buffer_minutes: null, buffer_gate: null }),
    step({ time: '12:37', type: '晚餐', desc: '福勝亭（日式）午餐約 50 分鐘', place: FUKUSHO, cost_item: 'dining', buffer_minutes: null, buffer_gate: null }),
    step({ time: '13:27', type: '步行', desc: '吃完走 4 分鐘到桃園統領威秀，取票', place: VIESHOW, cost_item: null, buffer_minutes: 9, buffer_gate: 'showtime' }),
    step({ time: '13:40', type: '電影', desc: '《不存在的罪人》片長 105 分鐘', place: VIESHOW, cost_item: 'movie_ticket', buffer_minutes: null, buffer_gate: null }),
    step({ time: '15:25', type: '步行', desc: '散場後走 6 分鐘回桃園站', place: STATION_TY, cost_item: null, buffer_minutes: 9, buffer_gate: 'return_trip' }),
    step({ time: '15:40', type: '交通', desc: '桃園站搭台鐵回中壢，約 25 分鐘', place: STATION_TY, cost_item: 'transit_inbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '16:05', type: '到家', desc: '回到中壢站', place: STATION_ZL, cost_item: null, buffer_minutes: 115, buffer_gate: 'latest_return' }),
  ],
  refs: { showtime_id: 119, restaurant_id: 9, outbound_trip_id: 5400, inbound_trip_id: 5605 },
}

export const itineraryWeekend: ItineraryResponse = {
  ...itineraryOk,
  funnel_stats: {
    total_checked: 1640,
    feasible_count: 57,
    returned_count: 3,
    by_filter: [
      { id: 1, name: '時空連貫', eliminated: 700 },
      { id: 2, name: '餐飲營業', eliminated: 520 },
      { id: 3, name: '步行距離', eliminated: 240 },
      { id: 4, name: '末班車', eliminated: 98 },
      { id: 5, name: '預算', eliminated: 25 },
    ],
  },
  top_3_proposals: [w1, w2, w3],
}

/* ── 情境 ③：小資之夜（18:00–23:00・看完再吃・每人 $500） ── */

const b1: Proposal = {
  rank: 1,
  rank_label: 'Jev首選・最省',
  highlight: { key: 'cheapest', label: '最省', reason: '每人 $470，三個方案中最便宜' },
  confidence_breakdown: { movie_prob: 0.17, restaurant_prob: 0.41, combined: 0.07 },
  summary: { departure_time: '18:20', return_time: '22:30', early_return_buffer_minutes: 30, min_buffer_minutes: 10, total_cost_per_person: 470 },
  cost_breakdown: { movie_ticket: estimated(270), dining: estimated(150), transit_outbound: transit(25), transit_inbound: transit(25) },
  timeline_steps: [
    step({ time: '18:20', type: '交通', desc: '中壢站搭台鐵到桃園站，約 25 分鐘', place: STATION_ZL, cost_item: 'transit_outbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '18:45', type: '步行', desc: '走 5 分鐘到桃園統領威秀，取票', place: VIESHOW, cost_item: null, buffer_minutes: 10, buffer_gate: 'showtime' }),
    step({ time: '19:00', type: '電影', desc: '《劇場版 魔法少女小圓》片長 119 分鐘（平日晚場）', place: VIESHOW, cost_item: 'movie_ticket', buffer_minutes: null, buffer_gate: null }),
    step({ time: '20:59', type: '步行', desc: '散場後走 3 分鐘到吉豚屋，候位約 5 分鐘', place: KATSUYA, cost_item: null, buffer_minutes: 23, buffer_gate: 'last_order' }),
    step({ time: '21:07', type: '晚餐', desc: '吉豚屋（日式）丼飯約 40 分鐘，最後點餐 21:30', place: KATSUYA, cost_item: 'dining', buffer_minutes: null, buffer_gate: null }),
    step({ time: '21:47', type: '步行', desc: '走 6 分鐘回桃園站', place: STATION_TY, cost_item: null, buffer_minutes: 12, buffer_gate: 'return_trip' }),
    step({ time: '22:05', type: '交通', desc: '桃園站搭台鐵回中壢，約 25 分鐘', place: STATION_TY, cost_item: 'transit_inbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '22:30', type: '到家', desc: '回到中壢站', place: STATION_ZL, cost_item: null, buffer_minutes: 30, buffer_gate: 'latest_return' }),
  ],
  refs: { showtime_id: 131, restaurant_id: 7, outbound_trip_id: 5530, inbound_trip_id: 5702 },
}

const b2: Proposal = {
  rank: 2,
  rank_label: 'Jev第二選擇・最穩',
  highlight: { key: 'safest', label: '最穩', reason: '每一段都留 15 分鐘以上的餘裕' },
  confidence_breakdown: { movie_prob: 0.2, restaurant_prob: 0.41, combined: 0.08 },
  summary: { departure_time: '18:05', return_time: '22:15', early_return_buffer_minutes: 45, min_buffer_minutes: 15, total_cost_per_person: 490 },
  cost_breakdown: { movie_ticket: estimated(270), dining: estimated(170), transit_outbound: transit(25), transit_inbound: transit(25) },
  timeline_steps: [
    step({ time: '18:05', type: '交通', desc: '中壢站搭台鐵到桃園站，約 25 分鐘', place: STATION_ZL, cost_item: 'transit_outbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '18:30', type: '步行', desc: '走 5 分鐘到桃園統領威秀，取票', place: VIESHOW, cost_item: null, buffer_minutes: 15, buffer_gate: 'showtime' }),
    step({ time: '18:50', type: '電影', desc: '《不存在的罪人》片長 105 分鐘（平日晚場）', place: VIESHOW, cost_item: 'movie_ticket', buffer_minutes: null, buffer_gate: null }),
    step({ time: '20:35', type: '步行', desc: '散場後走 3 分鐘到吉豚屋，候位約 10 分鐘', place: KATSUYA, cost_item: null, buffer_minutes: 42, buffer_gate: 'last_order' }),
    step({ time: '20:48', type: '晚餐', desc: '吉豚屋（日式）丼飯約 40 分鐘，最後點餐 21:30', place: KATSUYA, cost_item: 'dining', buffer_minutes: null, buffer_gate: null }),
    step({ time: '21:28', type: '步行', desc: '走 6 分鐘回桃園站', place: STATION_TY, cost_item: null, buffer_minutes: 16, buffer_gate: 'return_trip' }),
    step({ time: '21:50', type: '交通', desc: '桃園站搭台鐵回中壢，約 25 分鐘', place: STATION_TY, cost_item: 'transit_inbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '22:15', type: '到家', desc: '回到中壢站', place: STATION_ZL, cost_item: null, buffer_minutes: 45, buffer_gate: 'latest_return' }),
  ],
  refs: { showtime_id: 134, restaurant_id: 7, outbound_trip_id: 5527, inbound_trip_id: 5699 },
}

const b3: Proposal = {
  rank: 3,
  rank_label: 'Jev第三選擇',
  highlight: { key: 'earliest_return', label: '最早回到站', reason: '21:50 就回到中壢站，比最晚時間早 70 分' },
  confidence_breakdown: { movie_prob: 0.2, restaurant_prob: 0.37, combined: 0.07 },
  summary: { departure_time: '18:00', return_time: '21:50', early_return_buffer_minutes: 70, min_buffer_minutes: 6, total_cost_per_person: 500 },
  cost_breakdown: { movie_ticket: estimated(300), dining: estimated(150), transit_outbound: transit(25), transit_inbound: transit(25) },
  timeline_steps: [
    step({ time: '18:00', type: '交通', desc: '中壢站搭台鐵到桃園站，約 25 分鐘', place: STATION_ZL, cost_item: 'transit_outbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '18:25', type: '步行', desc: '走 5 分鐘到桃園統領威秀，取票', place: VIESHOW, cost_item: null, buffer_minutes: 10, buffer_gate: 'showtime' }),
    step({ time: '18:40', type: '電影', desc: '《不存在的罪人》片長 105 分鐘', place: VIESHOW, cost_item: 'movie_ticket', buffer_minutes: null, buffer_gate: null }),
    step({ time: '20:25', type: '步行', desc: '散場後走 3 分鐘到吉豚屋，候位約 5 分鐘', place: KATSUYA, cost_item: null, buffer_minutes: 57, buffer_gate: 'last_order' }),
    step({ time: '20:33', type: '晚餐', desc: '吉豚屋（日式）丼飯約 40 分鐘，最後點餐 21:30', place: KATSUYA, cost_item: 'dining', buffer_minutes: null, buffer_gate: null }),
    step({ time: '21:13', type: '步行', desc: '走 6 分鐘回桃園站', place: STATION_TY, cost_item: null, buffer_minutes: 6, buffer_gate: 'return_trip' }),
    step({ time: '21:25', type: '交通', desc: '桃園站搭台鐵回中壢，約 25 分鐘', place: STATION_TY, cost_item: 'transit_inbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '21:50', type: '到家', desc: '回到中壢站', place: STATION_ZL, cost_item: null, buffer_minutes: 70, buffer_gate: 'latest_return' }),
  ],
  refs: { showtime_id: 129, restaurant_id: 7, outbound_trip_id: 5525, inbound_trip_id: 5690 },
}

export const itineraryBudget: ItineraryResponse = {
  ...itineraryOk,
  funnel_stats: {
    total_checked: 1880,
    feasible_count: 17,
    returned_count: 3,
    by_filter: [
      { id: 1, name: '時空連貫', eliminated: 820 },
      { id: 2, name: '餐飲營業', eliminated: 610 },
      { id: 3, name: '步行距離', eliminated: 260 },
      { id: 4, name: '末班車', eliminated: 101 },
      { id: 5, name: '預算', eliminated: 72 },
    ],
  },
  top_3_proposals: [b1, b2, b3],
}
