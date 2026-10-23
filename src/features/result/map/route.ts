import type { Place, Proposal } from '@/api/schemas'
import type { z } from 'zod'

type PlaceT = z.infer<typeof Place>

/*
 * 路線資料（沉浸式新版 PR4）：照時間軸的順序，把地點整理成「第幾站、怎麼到、什麼時候在那裡」。
 * 只用後端回傳的時間軸，不另外算時間（Q41）。
 *
 * 座標：後端的 place 可以帶 lat／lng（API 提案 #2），目前假資料沒有。
 * 沒有座標時用下面這張「示意座標」表（車站、影城、餐廳的大概位置），畫面上一定標「示意座標」。
 */
const APPROX: Record<string, [number, number]> = {
  中壢車站: [24.9537, 121.2256],
  桃園車站: [24.9891, 121.3134],
  桃園統領威秀: [24.9905, 121.3117],
  吉豚屋: [24.9894, 121.3108],
  福勝亭: [24.9912, 121.3101],
}

export type RouteNode = {
  /** 第幾站，從 1 開始 */
  n: number
  name: string
  kind: PlaceT['kind']
  /** 怎麼到這一站：第一站是起點 */
  via: 'start' | 'train' | 'walk'
  /** 在這一站的時間（第一步到最後一步），例如 17:40–20:06 */
  from: string
  to: string
  /** 在這一站做什麼（時間軸那幾步的說明） */
  notes: string[]
  lat: number | null
  lng: number | null
  /** 座標是示意表來的，不是後端給的 */
  approx: boolean
}

export function routeNodes(plan: Proposal): RouteNode[] {
  const nodes: RouteNode[] = []
  plan.timeline_steps.forEach((s, i) => {
    if (!s.place) return
    const last = nodes.at(-1)
    if (last?.name === s.place.name) {
      last.to = s.time
      last.notes.push(s.desc)
      return
    }
    const prev = plan.timeline_steps[i - 1]
    const own = s.place.lat != null && s.place.lng != null
    const approx = APPROX[s.place.name]
    nodes.push({
      n: nodes.length + 1,
      name: s.place.name,
      kind: s.place.kind,
      via: nodes.length === 0 ? 'start' : prev?.type === '交通' ? 'train' : 'walk',
      from: s.time,
      to: s.time,
      notes: [s.desc],
      lat: own ? s.place.lat! : (approx?.[0] ?? null),
      lng: own ? s.place.lng! : (approx?.[1] ?? null),
      approx: !own,
    })
  })
  return nodes
}

/** 每一站都有座標才畫得出真實地圖 */
export const hasCoords = (nodes: RouteNode[]) => nodes.every((n) => n.lat != null && n.lng != null)
