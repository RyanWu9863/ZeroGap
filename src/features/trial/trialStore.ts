import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { urlFlag } from '@/shared/lib/urlFlag'

/*
 * 試用模式（Q79、Q80）：找同學試用時，網址加 ?trial=1。
 * 自動記三個時間點：進介紹頁 → 進精靈（按了開始）→ 看到結果；看完結果填 3 題小問卷。
 * 紀錄存在這台電腦的瀏覽器裡，在「系統幕後」匯出。?trial=0 關閉。
 */
export type TrialAnswers = { yellow: 'estimate' | 'discount' | 'recommend'; willing: number; faster: boolean }

export type TrialSession = {
  id: string
  proto: string
  startedAt: number
  startClickAt?: number
  resultAt?: number
  answers?: TrialAnswers
}

type TrialState = {
  active: boolean
  current: TrialSession | null
  sessions: TrialSession[]
  begin: (proto: string) => void
  mark: (field: 'startClickAt' | 'resultAt') => void
  answer: (a: TrialAnswers) => void
  clear: () => void
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
      merge: (persisted, current) => {
        const fromUrl = urlFlag('trial')
        return { ...current, ...(persisted as object), ...(fromUrl === null ? {} : { active: fromUrl }) }
      },
    },
  ),
)
