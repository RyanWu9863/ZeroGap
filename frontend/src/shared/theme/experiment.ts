import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'
import { keepAsIs, pickValid, STORAGE_VERSION } from '@/store/persistSafe'

/*
 * 沉浸式新版的開關（docs/沉浸式體驗_第一階段盤點與設計方案.md）。
 * 預設關閉：試用和舊版看到的畫面完全不變；?exp=1 打開、?exp=0 關閉，會記在瀏覽器。
 * 投票後決定新版要不要變成預設，到時候把這個開關拿掉。
 */
const fromUrl = (): boolean | null => {
  const v = new URLSearchParams(window.location.search).get('exp')
  return v === '1' ? true : v === '0' ? false : null
}

export const useExperimentStore = create<{ on: boolean; setOn: (on: boolean) => void }>()(
  persist((set) => ({ on: fromUrl() ?? false, setOn: (on) => set({ on }) }), {
    name: 'zg-exp',
    version: STORAGE_VERSION,
    migrate: keepAsIs,
    merge: (persisted, current) => {
      const url = fromUrl()
      return { ...current, ...pickValid<{ on: boolean }>(persisted, { on: z.boolean() }), ...(url == null ? {} : { on: url }) }
    },
  }),
)

export const useExperiment = () => useExperimentStore((s) => s.on)
