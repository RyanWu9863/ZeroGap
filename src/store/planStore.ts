import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ItineraryRequest } from '@/api/schemas'
import { benchmarkRequest } from '@/mocks/request'

/*
 * 「點餐單」：使用者填的條件和目前選的方案（決策 Q73）。
 * persist 會自動存進瀏覽器，重新整理也不會不見（決策 Q25）。
 */
type PlanState = {
  request: ItineraryRequest
  selectedRank: number
  setRequest: (patch: Partial<ItineraryRequest>) => void
  selectRank: (rank: number) => void
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => ({
      request: benchmarkRequest,
      selectedRank: 1,
      setRequest: (patch) => set((s) => ({ request: { ...s.request, ...patch }, selectedRank: 1 })),
      selectRank: (rank) => set({ selectedRank: rank }),
    }),
    { name: 'zg-plan' },
  ),
)
