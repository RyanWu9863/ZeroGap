import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
 * 兩版試做稿（決策 Q37b、Q38）：A 時刻表（淺色）／B 電影感（深色）。
 * 網址 ?proto=cinematic 可以直接指定，方便投票時傳連結。
 */
export type Proto = 'timetable' | 'cinematic'

export const PROTO_NAME: Record<Proto, string> = { timetable: 'A 時刻表', cinematic: 'B 電影感' }

const fromUrl = (): Proto | null => {
  const v = new URLSearchParams(window.location.search).get('proto')
  return v === 'timetable' || v === 'cinematic' ? v : null
}

export const useProtoStore = create<{ proto: Proto; setProto: (p: Proto) => void }>()(
  persist((set) => ({ proto: fromUrl() ?? 'timetable', setProto: (proto) => set({ proto }) }), {
    name: 'zg-proto',
    merge: (persisted, current) => ({ ...current, ...(persisted as object), ...(fromUrl() ? { proto: fromUrl()! } : {}) }),
  }),
)

/** 把目前的試做版寫到 <html data-proto>，CSS 代號就會跟著換 */
export function useApplyProto() {
  const proto = useProtoStore((s) => s.proto)
  useEffect(() => {
    const root = document.documentElement
    root.dataset.proto = proto
    root.classList.toggle('dark', proto === 'cinematic')
  }, [proto])
  return proto
}
