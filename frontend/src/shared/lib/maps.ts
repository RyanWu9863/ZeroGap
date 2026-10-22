/*
 * Google 地圖連結（決策 Q28b，規格書 6.7）。用 Maps URLs，只是一般網址，不需要 API 金鑰。
 * - Google 來源的餐廳只有 place_id、沒有座標：帶 *_place_id，同時一定要帶名稱（官方規定）
 * - 其他地點有座標就用座標，沒有就用名稱搜尋
 */
export type MapPlace = { name: string; lat?: number | null; lng?: number | null; place_id?: string | null }

const BASE = 'https://www.google.com/maps'
const where = (p: MapPlace) => (p.place_id ? p.name : p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : p.name)

/** 單一地點 */
export function placeUrl(p: MapPlace): string {
  const params = new URLSearchParams({ api: '1', query: where(p) })
  if (p.place_id) params.set('query_place_id', p.place_id)
  return `${BASE}/search/?${params.toString()}`
}

/** 同一個地點（名稱和 place_id 都一樣）不重複 */
const same = (a: MapPlace, b: MapPlace) => a.name === b.name && (a.place_id ?? null) === (b.place_id ?? null)

/**
 * 整條路線：起點 → 中途點 → 終點。
 * Google 的「大眾運輸」模式不支援中途點，所以有中途點時不指定交通方式，只有起訖兩點時才指定 transit。
 * 中途點的 place_id 要「每一個都有」才帶，順序和數量要跟 waypoints 對得上。
 */
export function routeUrl(places: MapPlace[]): string {
  const unique = places.filter((p, i) => i === 0 || !same(p, places[i - 1]))
  if (unique.length < 2) return placeUrl(unique[0])
  const origin = unique[0]
  const destination = unique[unique.length - 1]
  const mids = unique.slice(1, -1)
  const params = new URLSearchParams({ api: '1', origin: where(origin), destination: where(destination) })
  if (origin.place_id) params.set('origin_place_id', origin.place_id)
  if (destination.place_id) params.set('destination_place_id', destination.place_id)
  if (mids.length) {
    params.set('waypoints', mids.map(where).join('|'))
    if (mids.every((p) => p.place_id)) params.set('waypoint_place_ids', mids.map((p) => p.place_id).join('|'))
  } else params.set('travelmode', 'transit')
  return `${BASE}/dir/?${params.toString()}`
}
