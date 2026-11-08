import { create } from 'zustand'
import type { PlanRequest } from './schemas'

/*
 * 排行程請求的實測時間（給系統幕後的「決策時間軸」用）。
 * 這是瀏覽器量到的「送出 → 收到」，是真的；排程服務內部每一步花多久，後端沒有回傳，所以不記也不編。
 */
export type Timing = { sentAt: number; ms: number; source: 'mock' | 'api' }

const keyOf = (req: PlanRequest) => JSON.stringify(req)

export const useTimingStore = create<{ byKey: Record<string, Timing>; record: (req: PlanRequest, t: Timing) => void }>()((set) => ({
  byKey: {},
  record: (req, t) => set((s) => ({ byKey: { ...s.byKey, [keyOf(req)]: t } })),
}))

export const useTiming = (req: PlanRequest): Timing | undefined => useTimingStore((s) => s.byKey[keyOf(req)])
