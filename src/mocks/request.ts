import type { ItineraryRequest } from '@/api/schemas'

/** 基準案例（AI_CONTEXT §8），日期改成 Demo 週。也是情境卡 ① 的條件。 */
export const benchmarkRequest: ItineraryRequest = {
  target_city: '桃園市',
  district_hub: '桃園區',
  origin_city: '桃園市',
  origin_station: '中壢站',
  date: '2026-10-30',
  earliest_departure: '17:00',
  latest_return: '23:00',
  dining_order: '看完電影再吃',
  movie_title: '交給 Jev 決定', // API 的固定值；畫面顯示成「幫我挑」,
  movie_genre: '不限',
  theater_type: '不限',
  language: '不限',
  cuisine_type: '日式',
  dietary_restriction: '沒有',
  budget_per_person: 1000,
  max_walk_minutes: 12,
}
