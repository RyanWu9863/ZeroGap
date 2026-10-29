import type { PlanRequest } from '@/api/schemas'
import { todayISO } from '@/shared/lib/dates'

/**
 * 基準案例（AI_CONTEXT §8），也是情境卡 ① 的條件。
 * 欄位照後端規格書 6.4：一律送代碼或 id。
 * 車站 id 是假資料裡「中壢」的 id；接真後端時由 api/benchmark.ts 依站名換成真的 id。
 * 日期跟著今天走（計畫 P0-1，Q1 選 a）：哪天打開都不會是過去的日子；
 * 今天如果沒有場次，精靈第 2 步會再換成最近可選日。
 */
export const BENCHMARK_STATION_NAME = '中壢'

export const benchmarkRequest: PlanRequest = {
  area: 'taoyuan',
  origin_station_id: 103,
  origin_lat: null,
  origin_lng: null,
  date: todayISO(),
  earliest_departure: '17:00',
  latest_home: '23:00',
  order: 'movie_first',
  movie_id: null,
  movie_genre: null,
  hall_type: null,
  language: null,
  cuisine: 'japanese',
  budget_per_person: 1000,
  max_walk_minutes: 12,
}
