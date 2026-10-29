import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { z } from 'zod'
import { urlFlag } from '@/shared/lib/urlFlag'
import { keepAsIs, pickValid, STORAGE_VERSION } from '@/store/persistSafe'

/**
 * 簡報模式（Q95）：網址加 ?present=1 打開、?present=0 關閉。
 * 存在「這個分頁」（sessionStorage），關掉分頁就恢復正常，不會影響一般使用者。
 */
export const usePresentStore = create<{ on: boolean }>()(
  persist((): { on: boolean } => ({ on: false }), {
    name: 'zg-present',
    storage: createJSONStorage(() => sessionStorage),
    version: STORAGE_VERSION,
    migrate: keepAsIs,
    merge: (persisted, current) => {
      const fromUrl = urlFlag('present')
      return { ...current, ...pickValid<{ on: boolean }>(persisted, { on: z.boolean() }), ...(fromUrl === null ? {} : { on: fromUrl }) }
    },
  }),
)
