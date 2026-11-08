/*
 * 地圖查過的路線和餐廳位置存在這台瀏覽器（規格 5「省錢」）：同一份行程不重複查。
 * 7 天後丟掉（跟分享連結一樣長，也在 Google 准許暫存座標的 30 天內）；最多 200 筆。
 */
export type LatLng = { lat: number; lng: number }
export const CACHE_KEY = 'zg-route-cache'
export const CACHE_TTL_MS = 7 * 86_400_000
const KEEP = 200
type Entry = { v: unknown; t: number }

function load(): Record<string, Entry> {
  try {
    const o = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as unknown
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, Entry>) : {}
  } catch {
    return {}
  }
}

export function readCache<T>(key: string, now = Date.now()): T | null {
  const e = load()[key]
  return e && now - e.t <= CACHE_TTL_MS ? (e.v as T) : null
}

export function writeCache(key: string, value: unknown, now = Date.now()): void {
  const all = { ...load(), [key]: { v: value, t: now } }
  const kept = Object.entries(all).filter(([, e]) => now - e.t <= CACHE_TTL_MS).sort(([, a], [, b]) => b.t - a.t).slice(0, KEEP)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // 存不進去就每次重查，地圖照樣能用
  }
}

export const walkKey = (jobId: string, rank: number, leg: number) => `walk:${jobId}:${rank}:${leg}`
export const placeKey = (placeId: string) => `place:${placeId}`
