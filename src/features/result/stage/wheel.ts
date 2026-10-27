/*
 * 三方案輪盤的幾何（純函式，有單元測試）。
 * 把方案想成排在一個水平轉盤上：rot 是轉盤轉到第幾格（可以有小數，拖曳時連續變化），
 * 每張卡離中央差幾格（offset）決定它的位置、大小、角度和透明度。
 */

export type WheelLayout = {
  /** three：桌機三張都完整看得到、互不重疊；peek：中央一張，左右只露一條邊 */
  mode: 'three' | 'peek'
  /** 卡片寬（px） */
  card: number
  /** 中央到左右卡片中心的距離（px） */
  step: number
  /** 左右卡片的縮放 */
  side: number
  /** 左右卡片的透明度 */
  sideOpacity: number
  /** 左右卡片朝中央轉的角度（度） */
  tilt: number
}

const GAP = 24
/** peek 模式左右卡片最多露出多少（px）；露出一條邊就夠，不讓半張卡的文字被畫面邊緣切掉 */
const PEEK = 36

/** 依舞台寬度決定排法：寬度夠就三張並排、不重疊；不夠就只放一張，左右露邊 */
export function wheelLayout(width: number): WheelLayout {
  const side3 = 0.78
  const card3 = Math.min(416, Math.floor((width - 2 * GAP) / (1 + 2 * side3)))
  if (card3 >= 340) return { mode: 'three', card: card3, step: (card3 * (1 + side3)) / 2 + GAP, side: side3, sideOpacity: 1, tilt: 16 }
  const side = 0.86
  const card = Math.max(240, Math.min(400, width - 2 * (PEEK + 14)))
  const peek = Math.max(12, Math.min(PEEK, (width - card) / 2 - 14))
  return { mode: 'peek', card, step: width / 2 - peek + (card * side) / 2, side, sideOpacity: 0.55, tilt: 24 }
}

/** 方案 i 離中央差幾格。三個以上會繞一圈（最右邊再往右就回到最左邊），範圍 [-n/2, n/2) */
export function wheelOffset(i: number, rot: number, n: number): number {
  const d = i - rot
  if (n < 3) return d
  return (((d + n / 2) % n) + n) % n - n / 2
}

/** 第 k 格（可以是負的或超過 n）對應第幾個方案 */
export const indexAt = (k: number, n: number) => ((k % n) + n) % n

/** 要把方案 index 轉到中央，離 rot 最近的格數（走最短的方向） */
export function nearestTurn(rot: number, index: number, n: number): number {
  if (n < 3) return index
  return Math.round(rot + wheelOffset(index, rot, n))
}

export type Pose = { x: number; scale: number; rotateY: number; opacity: number; zIndex: number }

/** 離中央 d 格的卡片長什麼樣子：沿著圓走，一格 120°；轉到背面（±1.5 格）時縮小、淡出、在最底層 */
export function wheelPose(d: number, l: WheelLayout): Pose {
  const a = Math.max(-1.5, Math.min(1.5, d)) * ((2 * Math.PI) / 3)
  const sin = Math.sin(a)
  const depth = (Math.cos(a) + 0.5) / 1.5 // 中央 1、左右 0、背面 -1/3
  const opacity = depth >= 0 ? l.sideOpacity + (1 - l.sideOpacity) * depth : l.sideOpacity * (1 + 3 * depth)
  return {
    x: (l.step * sin) / Math.sin((2 * Math.PI) / 3),
    scale: l.side + (1 - l.side) * depth,
    rotateY: (sin / Math.sin((2 * Math.PI) / 3)) * l.tilt || 0, // 外側的邊往後退，像卡片貼在轉盤外圈；|| 0 避免 -0
    opacity: Math.max(0, Math.min(1, opacity)),
    zIndex: Math.round(depth * 10) + 10,
  }
}
