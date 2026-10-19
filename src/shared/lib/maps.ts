/*
 * Google 地圖連結（決策 Q28b）。只是一般網址，不需要 API 金鑰。
 * 有座標就用座標，沒有就用地點名稱搜尋。
 */
type MapPlace = { name: string; lat?: number; lng?: number }

const BASE = 'https://www.google.com/maps'
const where = (p: MapPlace) => (p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : p.name)

/** 單一地點 */
export function placeUrl(p: MapPlace): string {
  return `${BASE}/search/?api=1&query=${encodeURIComponent(where(p))}`
}

/**
 * 整條路線：起點 → 中途點 → 終點。
 * Google 的「大眾運輸」模式不支援中途點，所以有中途點時不指定交通方式，
 * 只有起訖兩點時才指定 transit。
 */
export function routeUrl(places: MapPlace[]): string {
  const unique = places.filter((p, i) => i === 0 || p.name !== places[i - 1].name)
  if (unique.length < 2) return placeUrl(unique[0])
  const origin = unique[0]
  const destination = unique[unique.length - 1]
  const waypoints = unique.slice(1, -1).map(where).join('|')
  const params = new URLSearchParams({ api: '1', origin: where(origin), destination: where(destination) })
  if (waypoints) params.set('waypoints', waypoints)
  else params.set('travelmode', 'transit')
  return `${BASE}/dir/?${params.toString()}`
}
