import { create } from 'zustand'

export type MapMode = 'sketch' | 'google'

/** 有設定 Google 地圖金鑰（VITE_GOOGLE_MAPS_KEY）才能開真實地圖；有的話預設就開（規格 D10） */
export const HAS_MAPS_KEY = Boolean(import.meta.env.VITE_GOOGLE_MAPS_KEY)
export type Camera = { center: { lat: number; lng: number }; zoom: number }

/**
 * 地圖的顯示狀態：換方案、開關詳情、在示意圖和 Google 地圖之間切換時都保留。
 * camera＝使用者在 Google 地圖上移動後的視角；換到別的方案時清掉，重新對準新路線。
 */
export const useMapStore = create<{
  mode: MapMode
  camera: Camera | null
  cameraFor: number | null
  setMode: (m: MapMode) => void
  setCamera: (rank: number, c: Camera) => void
}>()((set) => ({
  mode: HAS_MAPS_KEY ? 'google' : 'sketch',
  camera: null,
  cameraFor: null,
  setMode: (mode) => set({ mode }),
  setCamera: (rank, camera) => set({ camera, cameraFor: rank }),
}))
