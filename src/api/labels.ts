import { stationDisplay } from '@/shared/lib/format'
import { useAreas, useCategories, useCoverage, useStations } from './queries'
import type { PlanRequest } from './schemas'

/**
 * 請求裡只有代碼和 id（規格書 6.4），畫面要顯示名稱時從下拉選單的資料查回來。
 * 資料還沒載入時先給一個看得懂的替代字。
 */
export type RequestLabels = {
  station: string
  area: string
  movie: string | null
  genre: string | null
  hall: string | null
  cuisine: string | null
}

export function useRequestLabels(r: PlanRequest): RequestLabels {
  const stations = useStations().data
  const areas = useAreas().data
  const cuisines = useCategories('cuisine').data
  const genres = useCategories('movie_genre').data
  const day = useCoverage(r.area || undefined, r.date || undefined).data
  const station = stations?.find((s) => s.id === r.origin_station_id)
  return {
    station: station ? stationDisplay(station) : '出發站',
    area: areas?.find((a) => a.code === r.area)?.name ?? r.area,
    movie: r.movie_id == null ? null : (day?.movies.find((m) => m.id === r.movie_id)?.title ?? '指定的電影'),
    genre: r.movie_genre == null ? null : (genres?.find((g) => g.code === r.movie_genre)?.label ?? r.movie_genre),
    hall: r.hall_type == null ? null : (day?.hall_types.find((h) => h.code === r.hall_type)?.label ?? r.hall_type),
    cuisine: r.cuisine == null ? null : (cuisines?.find((c) => c.code === r.cuisine)?.label ?? r.cuisine),
  }
}

/** 料理代碼 → 名稱（備選餐廳只有代碼） */
export function useCuisineLabel() {
  const cuisines = useCategories('cuisine').data
  return (code: string | null | undefined) => (code ? (cuisines?.find((c) => c.code === code)?.label ?? code) : null)
}
