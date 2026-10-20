import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlanRequest } from '@/api/schemas'
import { benchmarkRequest } from '@/mocks/request'

/**
 * 「清空重來」後的空白點餐單：地點、出發站、日期要重選，其他用常見預設值。
 * 「不限」「幫我挑」都是 null（規格書 6.4）；還沒選的商圈、出發站分別是 '' 和 0。
 */
export const blankRequest: PlanRequest = {
  ...benchmarkRequest,
  area: '',
  origin_station_id: 0,
  date: '',
  movie_id: null,
  movie_genre: null,
  hall_type: null,
  language: null,
  cuisine: null,
}

/*
 * 「點餐單」：使用者填的條件和目前選的方案（決策 Q73）。
 * persist 會自動存進瀏覽器，重新整理也不會不見（決策 Q25）。
 * version 2：改接後端規格書 v0.9，舊版存的是中文名稱，讀到就換回基準案例。
 */
type PlanState = {
  request: PlanRequest
  selectedRank: number
  setRequest: (patch: Partial<PlanRequest>) => void
  /** 整份換掉（從網址讀回來、結果頁改條件時用） */
  replaceRequest: (next: PlanRequest) => void
  resetRequest: () => void
  selectRank: (rank: number) => void
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => ({
      request: benchmarkRequest,
      selectedRank: 1,
      setRequest: (patch) => set((s) => ({ request: { ...s.request, ...patch }, selectedRank: 1 })),
      replaceRequest: (next) => set({ request: next, selectedRank: 1 }),
      resetRequest: () => set({ request: blankRequest, selectedRank: 1 }),
      selectRank: (rank) => set({ selectedRank: rank }),
    }),
    {
      name: 'zg-plan',
      version: 2,
      migrate: () => ({ request: benchmarkRequest, selectedRank: 1 }),
      partialize: (s) => ({ request: s.request, selectedRank: s.selectedRank }),
    },
  ),
)
