import { useQuery } from '@tanstack/react-query'
import { getOptions, getStatus, postItineraries } from './client'
import type { ItineraryRequest } from './schemas'

/** 給畫面用：真的失敗了（不是正在重試）才回傳錯誤，重試中照樣顯示載入中（計畫 P1-1） */
export const failure = (q: { isError: boolean; isFetching: boolean; error: unknown }) => (q.isError && !q.isFetching ? q.error : null)

/** 「出餐口」：載入中、失敗、重試、快取都交給 TanStack Query（決策 Q73） */
/** enabled=false 時先不查（例如日期已經過了，P0-1） */
export function useItineraries(req: ItineraryRequest, enabled = true) {
  return useQuery({ queryKey: ['itineraries', req], queryFn: ({ signal }) => postItineraries(req, signal), staleTime: Infinity, enabled })
}

export function useStatus() {
  return useQuery({ queryKey: ['status'], queryFn: ({ signal }) => getStatus(signal), staleTime: 60_000 })
}

export function useOptions(date?: string, districtId?: number) {
  return useQuery({ queryKey: ['options', date ?? null, districtId ?? null], queryFn: ({ signal }) => getOptions(date, districtId, signal), staleTime: 5 * 60_000 })
}
