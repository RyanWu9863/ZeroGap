import { PICK_FOR_ME, type ItineraryRequest } from '@/api/schemas'
import { todayISO } from '@/shared/lib/dates'

/**
 * 基準案例（AI_CONTEXT §8），也是情境卡 ① 的條件。
 * 日期跟著今天走（計畫 P0-1，Q1 選 a）：哪天打開都不會是過去的日子；
 * 今天如果沒有場次，精靈第 2 步會再換成最近可選日。
 */
export const benchmarkRequest: ItineraryRequest = {
  target_city: '桃園市',
  district_hub: '桃園區',
  origin_city: '桃園市',
  origin_station: '中壢站',
  date: todayISO(),
  earliest_departure: '17:00',
  latest_return: '23:00',
  dining_order: '看完電影再吃',
  movie_title: PICK_FOR_ME,
  movie_genre: '不限',
  theater_type: '不限',
  language: '不限',
  cuisine_type: '日式',
  dietary_restriction: '沒有',
  budget_per_person: 1000,
  max_walk_minutes: 12,
}
