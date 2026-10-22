import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * 展示模式（Q69）：Demo 現場後端或網路出問題時，在系統幕後手動打開，
 * 改用預先錄製的回應，畫面頂端一定會顯示標籤，不偷偷替換。
 */
export const useDemoStore = create<{ demo: boolean; setDemo: (v: boolean) => void }>()(
  persist((set) => ({ demo: false, setDemo: (demo) => set({ demo }) }), { name: 'zg-demo' }),
)
