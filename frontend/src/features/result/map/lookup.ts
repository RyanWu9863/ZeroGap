/// <reference types="google.maps" />
import { placeKey, readCache, writeCache, type LatLng } from './routeCache'

/*
 * 向 Google 查走路路線和餐廳位置（先看暫存）。同一個查詢同時有好幾處在等時只送一次。
 * 查不到一律回 null，由畫面決定怎麼退回（走路畫直線虛線、餐廳說明查不到）。
 */
const inflight = new Map<string, Promise<unknown>>()

function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key) as Promise<T> | undefined
  if (hit) return hit
  const p = run().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** 一段走路：先看暫存，再問 Routes；沒結果就回 null */
export function walkPath(routesLib: google.maps.RoutesLibrary | null, key: string, a: LatLng, b: LatLng): Promise<LatLng[] | null> {
  const hit = readCache<LatLng[]>(key)
  if (hit && hit.length > 1) return Promise.resolve(hit)
  const route = routesLib?.Route
  if (!route) return Promise.resolve(null)
  return shared(key, async () => {
    try {
      const { routes } = await route.computeRoutes({ origin: a, destination: b, travelMode: 'WALKING', fields: ['path'] })
      const path = routes?.[0]?.path?.map((p) => ({ lat: p.lat, lng: p.lng })) ?? null
      if (!path || path.length < 2) return null
      writeCache(key, path)
      return path
    } catch {
      return null
    }
  })
}

/** 餐廳位置：先看暫存，再用 place_id 問 Places；查不到回 null */
export function findPlace(placesLib: google.maps.PlacesLibrary | null, id: string): Promise<LatLng | null> {
  const hit = readCache<LatLng>(placeKey(id))
  if (hit) return Promise.resolve(hit)
  const Place = placesLib?.Place
  if (!Place) return Promise.resolve(null)
  return shared(placeKey(id), async () => {
    try {
      const { place } = await new Place({ id }).fetchFields({ fields: ['location'] })
      if (!place.location) return null
      const p = { lat: place.location.lat(), lng: place.location.lng() }
      writeCache(placeKey(id), p)
      return p
    } catch {
      return null
    }
  })
}
