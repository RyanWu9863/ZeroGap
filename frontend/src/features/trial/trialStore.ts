import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'
import { urlFlag } from '@/shared/lib/urlFlag'
import { keepAsIs, pickValid, STORAGE_VERSION, validItems } from '@/store/persistSafe'

/*
 * 試用模式（Q79、Q80）：找同學試用時，網址加 ?trial=1。
 * 自動記三個時間點：進介紹頁 → 進精靈（按了開始）→ 看到結果；看完結果填 3 題小問卷。
 * 紀錄存在這台電腦的瀏覽器裡，在「系統幕後」匯出。?trial=0 關閉。
 */
const TrialAnswers = z.object({ yellow: z.enum(['estimate', 'discount', 'recommend']), willing: z.number(), faster: z.boolean() })
export type TrialAnswers = z.infer<typeof TrialAnswers>

const TrialSession = z.object({
  id: z.string(),
  proto: z.string(),
  startedAt: z.number(),
  startClickAt: z.number().optional(),
  resultAt: z.number().optional(),
  answers: TrialAnswers.optional(),
})
export type TrialSession = z.infer<typeof TrialSession>

type TrialState = {
  active: boolean
  current: TrialSession | null
  sessions: TrialSession[]
  begin: (proto: string) => void
  mark: (field: 'startClickAt' | 'resultAt') => void
  answer: (a: TrialAnswers) => void
  clear: () => void
}

/** 從暫存讀回時逐欄驗證（P1-3）；試用紀錄逐筆驗證，壞掉的那筆丟掉，其他紀錄一定留著 */
export function mergeTrialState(persisted: unknown, current: TrialState): TrialState {
  const fromUrl = urlFlag('trial')
  const valid = pickValid<TrialState>(persisted, { active: z.boolean(), current: TrialSession.nullable() })
  const sessions = validItems((persisted as { sessions?: unknown } | undefined)?.sessions, TrialSession)
  return { ...current, ...valid, ...(sessions ? { sessions } : {}), ...(fromUrl === null ? {} : { active: fromUrl }) }
}

export const useTrialStore = create<TrialState>()(
  persist(
    (set) => ({
      active: false,
      current: null,
      sessions: [],
      begin: (proto) => set({ current: { id: crypto.randomUUID().slice(0, 8), proto, startedAt: Date.now() } }),
      mark: (field) =>
        set((s) => (s.current && !s.current[field] ? { current: { ...s.current, [field]: Date.now() } } : s)),
      answer: (answers) =>
        set((s) => (s.current ? { sessions: [...s.sessions, { ...s.current, answers }], current: null } : s)),
      clear: () => set({ sessions: [], current: null }),
    }),
    {
      name: 'zg-trial',
      version: STORAGE_VERSION,
      migrate: keepAsIs,
      merge: mergeTrialState,
    },
  ),
)
