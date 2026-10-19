import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PICK_FOR_ME, type ItineraryRequest } from '@/api/schemas'
import { benchmarkRequest } from '@/mocks/request'

/** 「清空重來」後的空白點餐單：地點、出發站、日期要重選，其他用常見預設值 */
export const blankRequest: ItineraryRequest = {
  ...benchmarkRequest,
  district_hub: '',
  origin_station: '',
  date: '',
  movie_title: PICK_FOR_ME,
  movie_genre: '不限',
  theater_type: '不限',
  language: '不限',
  cuisine_type: '不限',
  dietary_restriction: '沒有',
}

/*
 * 「點餐單」：使用者填的條件和目前選的方案（決策 Q73）。
 * persist 會自動存進瀏覽器，重新整理也不會不見（決策 Q25）。
 */
type PlanState = {
  request: ItineraryRequest
  selectedRank: number
  /** 已經播過篩選動畫的條件；重新整理時不重播（Q62） */
  animatedKey: string | null
  setRequest: (patch: Partial<ItineraryRequest>) => void
  resetRequest: () => void
  selectRank: (rank: number) => void
  markAnimated: (key: string) => void
}

/** 同一組條件 → 同一把鑰匙 */
export const requestKey = (r: ItineraryRequest) => JSON.stringify(r)

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => ({
      request: benchmarkRequest,
      selectedRank: 1,
      animatedKey: null,
      setRequest: (patch) => set((s) => ({ request: { ...s.request, ...patch }, selectedRank: 1 })),
      resetRequest: () => set({ request: blankRequest, selectedRank: 1 }),
      selectRank: (rank) => set({ selectedRank: rank }),
      markAnimated: (key) => set({ animatedKey: key }),
    }),
    { name: 'zg-plan' },
  ),
)
