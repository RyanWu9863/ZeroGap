import type { ItineraryResponse, Proposal, TimelineStep } from '@/api/schemas'

/*
 * 開發用假資料（不是真實查詢結果）。
 * 來源：docs/API.md §6.5 範例，做了兩個修正：
 *   1. 補上「步行回桃園站」這一步（修正 AI_CONTEXT 待決 Q2：範例缺回程步行）
 *   2. 日期改成 Demo 週（基準案例 10/15 已過）
 * 並帶上 API 變更提案 #1 #2 #3 #7 #9 的欄位，方便後端對照格式。
 * 數字是示意值；後端完成後換成錄製的真實回應。
 */

const STATION_ZL = { name: '中壢車站', kind: 'station' as const }
const STATION_TY = { name: '桃園車站', kind: 'station' as const }
const VIESHOW = { name: '桃園統領威秀', kind: 'theater' as const }
const KATSUYA = { name: '吉豚屋', kind: 'restaurant' as const }
const FUKUSHO = { name: '福勝亭', kind: 'restaurant' as const }

const step = (s: TimelineStep): TimelineStep => s

const p1: Proposal = {
  rank: 1,
  rank_label: 'Jev首選・最省',
  highlight: { key: 'cheapest', label: '最省', reason: '每人 $550，三個方案中最便宜' },
  confidence_breakdown: { movie_prob: 0.16, restaurant_prob: 0.44, combined: 0.07 },
  summary: { departure_time: '17:15', return_time: '22:03', early_return_buffer_minutes: 57, min_buffer_minutes: 10, total_cost_per_person: 550 },
  cost_breakdown: {
    movie_ticket: { amount: 300, is_estimated: true },
    dining: { amount: 200, is_estimated: true },
    transit_outbound: { amount: 25, is_estimated: false },
    transit_inbound: { amount: 25, is_estimated: false },
  },
  timeline_steps: [
    step({ time: '17:15', type: '交通', desc: '中壢站搭台鐵到桃園站，約 25 分鐘', place: STATION_ZL, cost_item: 'transit_outbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '17:40', type: '步行', desc: '走 5 分鐘到桃園統領威秀，取票', place: VIESHOW, cost_item: null, buffer_minutes: 10, buffer_gate: 'showtime' }),
    step({ time: '17:55', type: '電影', desc: '《劇場版 魔法少女小圓》片長 119 分鐘', place: VIESHOW, cost_item: 'movie_ticket', buffer_minutes: null, buffer_gate: null }),
    step({ time: '20:06', type: '步行', desc: '散場後走 3 分鐘到吉豚屋，候位約 10 分鐘', place: KATSUYA, cost_item: null, buffer_minutes: 41, buffer_gate: 'last_order' }),
    step({ time: '20:19', type: '晚餐', desc: '吉豚屋（日式）快速用餐約 62 分鐘，最後點餐 21:00', place: KATSUYA, cost_item: 'dining', buffer_minutes: null, buffer_gate: null }),
    step({ time: '21:21', type: '步行', desc: '走 6 分鐘回桃園站', place: STATION_TY, cost_item: null, buffer_minutes: 11, buffer_gate: 'return_trip' }),
    step({ time: '21:38', type: '交通', desc: '桃園站搭台鐵回中壢，約 25 分鐘', place: STATION_TY, cost_item: 'transit_inbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '22:03', type: '到家', desc: '回到中壢站', place: STATION_ZL, cost_item: null, buffer_minutes: 57, buffer_gate: 'latest_return' }),
  ],
  refs: { showtime_id: 101, restaurant_id: 7, outbound_trip_id: 5521, inbound_trip_id: 5690 },
}

const p2: Proposal = {
  rank: 2,
  rank_label: 'Jev第二選擇・最穩',
  highlight: { key: 'safest', label: '最穩', reason: '每一段都留 15 分鐘以上的餘裕' },
  confidence_breakdown: { movie_prob: 0.21, restaurant_prob: 0.44, combined: 0.09 },
  summary: { departure_time: '17:05', return_time: '21:55', early_return_buffer_minutes: 65, min_buffer_minutes: 15, total_cost_per_person: 580 },
  cost_breakdown: {
    movie_ticket: { amount: 330, is_estimated: true },
    dining: { amount: 200, is_estimated: true },
    transit_outbound: { amount: 25, is_estimated: false },
    transit_inbound: { amount: 25, is_estimated: false },
  },
  timeline_steps: [
    step({ time: '17:05', type: '交通', desc: '中壢站搭台鐵到桃園站，約 25 分鐘', place: STATION_ZL, cost_item: 'transit_outbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '17:30', type: '步行', desc: '走 5 分鐘到桃園統領威秀，取票', place: VIESHOW, cost_item: null, buffer_minutes: 15, buffer_gate: 'showtime' }),
    step({ time: '17:50', type: '電影', desc: '《不存在的罪人》片長 105 分鐘', place: VIESHOW, cost_item: 'movie_ticket', buffer_minutes: null, buffer_gate: null }),
    step({ time: '19:47', type: '步行', desc: '散場後走 3 分鐘到吉豚屋，候位約 10 分鐘', place: KATSUYA, cost_item: null, buffer_minutes: 58, buffer_gate: 'last_order' }),
    step({ time: '20:02', type: '晚餐', desc: '吉豚屋（日式）快速用餐約 62 分鐘，最後點餐 21:00', place: KATSUYA, cost_item: 'dining', buffer_minutes: null, buffer_gate: null }),
    step({ time: '21:04', type: '步行', desc: '走 6 分鐘回桃園站', place: STATION_TY, cost_item: null, buffer_minutes: 20, buffer_gate: 'return_trip' }),
    step({ time: '21:30', type: '交通', desc: '桃園站搭台鐵回中壢，約 25 分鐘', place: STATION_TY, cost_item: 'transit_inbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '21:55', type: '到家', desc: '回到中壢站', place: STATION_ZL, cost_item: null, buffer_minutes: 65, buffer_gate: 'latest_return' }),
  ],
  refs: { showtime_id: 104, restaurant_id: 7, outbound_trip_id: 5519, inbound_trip_id: 5688 },
}

const p3: Proposal = {
  rank: 3,
  rank_label: 'Jev第三選擇',
  highlight: { key: 'earliest_return', label: '最早回到站', reason: '21:25 就回到中壢站，比最晚時間早 95 分' },
  confidence_breakdown: { movie_prob: 0.21, restaurant_prob: 0.39, combined: 0.08 },
  summary: { departure_time: '17:05', return_time: '21:25', early_return_buffer_minutes: 95, min_buffer_minutes: 5, total_cost_per_person: 720 },
  cost_breakdown: {
    movie_ticket: { amount: 300, is_estimated: true },
    dining: { amount: 370, is_estimated: false },
    transit_outbound: { amount: 25, is_estimated: false },
    transit_inbound: { amount: 25, is_estimated: false },
  },
  timeline_steps: [
    step({ time: '17:05', type: '交通', desc: '中壢站搭台鐵到桃園站，約 25 分鐘', place: STATION_ZL, cost_item: 'transit_outbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '17:30', type: '步行', desc: '走 5 分鐘到桃園統領威秀，取票', place: VIESHOW, cost_item: null, buffer_minutes: 15, buffer_gate: 'showtime' }),
    step({ time: '17:50', type: '電影', desc: '《不存在的罪人》片長 105 分鐘', place: VIESHOW, cost_item: 'movie_ticket', buffer_minutes: null, buffer_gate: null }),
    step({ time: '19:47', type: '步行', desc: '散場後走 4 分鐘到福勝亭，候位約 8 分鐘', place: FUKUSHO, cost_item: null, buffer_minutes: 31, buffer_gate: 'last_order' }),
    step({ time: '19:59', type: '晚餐', desc: '福勝亭（日式）用餐約 50 分鐘，最後點餐 20:30', place: FUKUSHO, cost_item: 'dining', buffer_minutes: null, buffer_gate: null }),
    step({ time: '20:49', type: '步行', desc: '走 6 分鐘回桃園站', place: STATION_TY, cost_item: null, buffer_minutes: 5, buffer_gate: 'return_trip' }),
    step({ time: '21:00', type: '交通', desc: '桃園站搭台鐵回中壢，約 25 分鐘', place: STATION_TY, cost_item: 'transit_inbound', buffer_minutes: null, buffer_gate: null }),
    step({ time: '21:25', type: '到家', desc: '回到中壢站', place: STATION_ZL, cost_item: null, buffer_minutes: 95, buffer_gate: 'latest_return' }),
  ],
  refs: { showtime_id: 104, restaurant_id: 9, outbound_trip_id: 5519, inbound_trip_id: 5660 },
}

export const itineraryOk: ItineraryResponse = {
  result_status: 'ok',
  system_status: {
    jev_mode: '模擬模式',
    llm_status: '未啟用',
    data_freshness: { atmovies: '10/28 19:49', osm: '10/28 20:06', tdx: '10/27 19:30' },
  },
  funnel_stats: {
    total_checked: 1880,
    feasible_count: 39,
    returned_count: 3,
    by_filter: [
      { id: 1, name: '時空連貫', eliminated: 820 },
      { id: 2, name: '餐飲營業', eliminated: 610 },
      { id: 3, name: '步行距離', eliminated: 260 },
      { id: 4, name: '末班車', eliminated: 101 },
      { id: 5, name: '預算', eliminated: 50 },
    ],
  },
  confidence_gate: { threshold: 0.6, passed: true, uncertain_field: null },
  top_3_proposals: [p1, p2, p3],
  alternatives: [],
  no_solution: null,
}
