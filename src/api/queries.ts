import { useQuery } from '@tanstack/react-query'
import { getStatus, postItineraries } from './client'
import type { ItineraryRequest } from './schemas'

/** 「出餐口」：載入中、失敗、重試、快取都交給 TanStack Query（決策 Q73） */
export function useItineraries(req: ItineraryRequest) {
  return useQuery({ queryKey: ['itineraries', req], queryFn: () => postItineraries(req), staleTime: Infinity })
}

export function useStatus() {
  return useQuery({ queryKey: ['status'], queryFn: getStatus, staleTime: 60_000 })
}
