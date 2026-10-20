import { useQuery } from '@tanstack/react-query'
import { getAreas, getCategories, getCounties, getCoverage, getStations, getStatus } from './client'

/*
 * 「出餐口」：下拉選單和狀態列的資料交給 TanStack Query（決策 Q73），載入中、失敗、重試、快取都不用自己管。
 * 規劃本身不在這裡：它要讀 2～3 分鐘的串流，另外由 planRuns.ts 管。
 */
const LONG = 10 * 60_000

export const useCounties = () => useQuery({ queryKey: ['counties'], queryFn: getCounties, staleTime: LONG })

/**
 * 約會商圈所在的縣市。目前只開放桃園市（2026-10-20 決定出發站也只開放桃園市）。
 * 後端有標 has_open_areas 就用它，沒標就當成桃園。
 */
export function useOpenCounty() {
  const { data } = useCounties()
  const open = data?.filter((c) => c.has_open_areas !== false) ?? []
  return { counties: data, county: open[0]?.code ?? (data ? 'Taoyuan' : undefined) }
}

export function useAreas() {
  const { county } = useOpenCounty()
  return useQuery({
    queryKey: ['areas', county],
    queryFn: async () => (await getAreas(county!)).filter((a) => a.is_open !== false),
    enabled: Boolean(county),
    staleTime: LONG,
  })
}

export function useStations() {
  const { county } = useOpenCounty()
  return useQuery({ queryKey: ['stations', county], queryFn: () => getStations(county!), enabled: Boolean(county), staleTime: LONG })
}

export const useCategories = (kind: 'movie_genre' | 'cuisine') =>
  useQuery({ queryKey: ['categories', kind], queryFn: () => getCategories(kind), staleTime: LONG })

/** 有場次的日期；帶日期時另外有當天的電影、片型、影廳、語言 */
export const useCoverage = (area: string | undefined, date?: string) =>
  useQuery({
    queryKey: ['coverage', area ?? null, date ?? null],
    queryFn: () => getCoverage(area!, date),
    enabled: Boolean(area),
    staleTime: 5 * 60_000,
  })

export const useStatus = () => useQuery({ queryKey: ['status'], queryFn: getStatus, staleTime: 60_000 })
