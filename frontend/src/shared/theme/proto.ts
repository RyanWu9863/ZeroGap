import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
 * 試做稿（決策 Q37b、Q38）：A 時刻表（淺色）／B 電影感（深色）／C Linear 風（深色極簡，2026-10-19 加）。
 * 網址 ?proto=linear 可以直接指定，方便投票時傳連結。
 */
export type Proto = 'timetable' | 'cinematic' | 'linear'

export const PROTO_NAME: Record<Proto, string> = { timetable: 'A 時刻表', cinematic: 'B 電影感', linear: 'C Linear 風' }
const PROTOS = Object.keys(PROTO_NAME) as Proto[]

const fromUrl = (): Proto | null => {
  const v = new URLSearchParams(window.location.search).get('proto')
  return PROTOS.includes(v as Proto) ? (v as Proto) : null
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
    root.classList.toggle('dark', proto !== 'timetable')
    const bg = getComputedStyle(root).getPropertyValue('--background').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  }, [proto])
  return proto
}
