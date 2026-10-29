import type { Place, Plan } from '@/api/schemas'
import { describeTimeline, placeName } from '@/shared/lib/steps'

/*
 * 路線資料（沉浸式新版 PR4）：照時間軸的順序，把地點整理成「第幾站、怎麼到、什麼時候在那裡」。
 * 只用後端回傳的時間軸，不另外算時間（Q41）。
 *
 * 座標一律用後端給的（規格書 6.5 的 place.lat／lng）。Google 來源的餐廳只有 place_id、沒有座標，
 * 也不能自己補座標（規格書 6.7）；這種方案畫不出真實地圖，只用示意圖。
 */
export type RouteNode = {
  /** 第幾站，從 1 開始 */
  n: number
  name: string
  kind: Place['kind']
  /** 開 Google 地圖用：Google 來源的餐廳要帶 place_id（maps.ts） */
  place: Place
  /** 怎麼到這一站：第一站是起點 */
  via: 'start' | 'train' | 'walk'
  /** 在這一站的時間（第一步到最後一步），例如 17:40–20:06 */
  from: string
  to: string
  /** 在這一站做什麼（時間軸那幾步的說明） */
  notes: string[]
  lat: number | null
  lng: number | null
}

/**
 * transit 的 place 是上車的地點，所以「到下一個地點」的交通方式看的是上一步（同 RouteSketch）。
 * 同一個地點（或名稱一樣，例如商圈代表點「中壢站」和出發站中壢站）連續幾步合併成一站。
 */
export function routeNodes(plan: Plan, date: string): RouteNode[] {
  const steps = describeTimeline(plan, date)
  const nodes: RouteNode[] = []
  steps.forEach((s, i) => {
    if (!s.place) return
    const name = placeName(s.place)
    const last = nodes.at(-1)
    if (last && ((last.kind === s.place.kind && last.place.id === s.place.id) || last.name === name)) {
      last.to = s.time
      last.notes.push(s.desc)
      return
    }
    nodes.push({
      n: nodes.length + 1,
      name,
      kind: s.place.kind,
      place: s.place,
      via: nodes.length === 0 ? 'start' : steps[i - 1]?.type === 'transit' ? 'train' : 'walk',
      from: s.time,
      to: s.time,
      notes: [s.desc],
      lat: s.place.lat ?? null,
      lng: s.place.lng ?? null,
    })
  })
  return nodes
}

/** 每一站都有座標才畫得出真實地圖 */
export const hasCoords = (nodes: RouteNode[]) => nodes.every((n) => n.lat != null && n.lng != null)
