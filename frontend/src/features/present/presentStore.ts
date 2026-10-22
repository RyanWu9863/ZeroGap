import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { urlFlag } from '@/shared/lib/urlFlag'

/**
 * 簡報模式（Q95）：網址加 ?present=1 打開、?present=0 關閉。
 * 存在「這個分頁」（sessionStorage），關掉分頁就恢復正常，不會影響一般使用者。
 */
export const usePresentStore = create<{ on: boolean }>()(
  persist((): { on: boolean } => ({ on: false }), {
    name: 'zg-present',
    storage: createJSONStorage(() => sessionStorage),
    merge: (persisted, current) => {
      const fromUrl = urlFlag('present')
      return { ...current, ...(persisted as object), ...(fromUrl === null ? {} : { on: fromUrl }) }
    },
  }),
)
