import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'
import { DraftRequest, type PlanRequest } from '@/api/schemas'
import { benchmarkRequest } from '@/mocks/request'
import { pickValid } from './persistSafe'

/**
 * 「清空重來」後的空白點餐單：地點、出發站、日期要重選，其他用常見預設值。
 * 「不限」「幫我挑」都是 null（規格書 6.4）；還沒選的商圈、出發站分別是 '' 和 0。
 */
export const blankRequest: PlanRequest = {
  ...benchmarkRequest,
  area: '',
  origin_station_id: 0,
  origin_lat: null,
  origin_lng: null,
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

/** 從暫存讀回時逐欄驗證（P1-3）：條件格式不對（舊版、被改過）就用預設條件，不讓畫面出錯 */
export function mergePlanState(persisted: unknown, current: PlanState): PlanState {
  return {
    ...current,
    ...pickValid<PlanState>(persisted, {
      request: DraftRequest,
      selectedRank: z.number().int().min(1).max(3),
    }),
  }
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
      // version 3：出發點可以是目前位置（多了 origin_lat、origin_lng），舊版的條件補上 null
      version: 3,
      migrate: (old, version) => {
        const o = old as { request?: PlanRequest; selectedRank?: number } | undefined
        if (version === 2 && o?.request) return { request: { ...o.request, origin_lat: null, origin_lng: null }, selectedRank: o.selectedRank ?? 1 }
        // 更舊的版本原樣交給 merge 逐欄驗證，對不上的欄位用預設值（persistSafe.ts 的版本規則）
        return old
      },
      merge: mergePlanState,
      partialize: (s) => ({ request: s.request, selectedRank: s.selectedRank }),
    },
  ),
)
