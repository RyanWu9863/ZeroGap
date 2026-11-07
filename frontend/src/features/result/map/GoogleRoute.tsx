/// <reference types="google.maps" />
import { AdvancedMarker, APIProvider, Map, useMap, useMapsLibrary, type MapCameraChangedEvent } from '@vis.gl/react-google-maps'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { resolveTheme, useSystemDark, useThemeStore, type Theme } from '@/shared/theme/theme'
import { midpoint, routeLegs, type Leg } from './legs'
import { useMapStore } from './mapStore'
import type { RouteNode } from './route'
import { placeKey, readCache, walkKey, writeCache, type LatLng } from './routeCache'

/*
 * Google 地圖模式（使用者 10/23 選 Google Maps API）。這個檔案延遲載入，沒打開地圖模式不會下載。
 * - 金鑰：VITE_GOOGLE_MAPS_KEY（瀏覽器金鑰，請在 Google Cloud 限制網域）；不寫死在程式裡
 * - 地圖 ID：VITE_GOOGLE_MAPS_MAP_ID（編號標記需要）；沒設時用 Google 提供的 DEMO_MAP_ID
 * - 走路段：Routes 函式庫 Route.computeRoutes 查真實步行路線；查不到那一段改畫直線虛線
 * - 搭車段：畫起訖站之間的線並標車種，照我們排的班次，不用 Google 建議的班次
 * - 餐廳只有 place_id 時：Places 函式庫 Place.fetchFields 查位置
 * - 查到的路線和位置都存在這台瀏覽器 7 天（routeCache.ts）
 */
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID'

/** 走路虛線：用重複的小線段當圖示 */
const DASH = { icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '12px' }

/** 每一站的位置：後端給的座標，沒有就用 place_id 查（先看暫存）。查不到的站是 null */
function useLocations(nodes: RouteNode[], onUnavailable: (why: string) => void): (LatLng | null)[] | null {
  const places = useMapsLibrary('places')
  const [pts, setPts] = useState<(LatLng | null)[] | null>(null)
  useEffect(() => {
    const need = nodes.some((n) => n.lat == null || n.lng == null)
    if (need && !places) return
    let stale = false
    const find = async (n: RouteNode): Promise<LatLng | null> => {
      if (n.lat != null && n.lng != null) return { lat: n.lat, lng: n.lng }
      const id = n.place.place_id
      if (!id || !places) return null
      const hit = readCache<LatLng>(placeKey(id))
      if (hit) return hit
      try {
        const { place } = await new places.Place({ id }).fetchFields({ fields: ['location'] })
        if (!place.location) return null
        const p = { lat: place.location.lat(), lng: place.location.lng() }
        writeCache(placeKey(id), p)
        return p
      } catch {
        return null
      }
    }
    void Promise.all(nodes.map(find)).then((all) => {
      if (stale) return
      if (all.some((p) => !p)) onUnavailable('這家餐廳的位置查不到，先用路線示意圖。')
      else setPts(all)
    })
    return () => { stale = true }
  }, [nodes, places, onUnavailable])
  return pts
}

/** 一段走路：先看暫存，再問 Routes；沒結果就回 null（呼叫的人畫直線虛線） */
async function walkPath(routesLib: google.maps.RoutesLibrary | null, key: string, a: LatLng, b: LatLng): Promise<LatLng[] | null> {
  const hit = readCache<LatLng[]>(key)
  if (hit && hit.length > 1) return hit
  if (!routesLib?.Route) return null
  try {
    const { routes } = await routesLib.Route.computeRoutes({ origin: a, destination: b, travelMode: 'WALKING', fields: ['path'] })
    const path = routes?.[0]?.path?.map((p) => ({ lat: p.lat, lng: p.lng })) ?? null
    if (!path || path.length < 2) return null
    writeCache(key, path)
    return path
  } catch {
    return null
  }
}

/** 畫線：搭車是起訖站之間的實線；走路先畫直線虛線，查到真實步行路線再換成路線；都用青色 */
function Lines({ legs, pts, jobId, rank, theme }: { legs: Leg[]; pts: LatLng[]; jobId: string; rank: number; theme: Theme }) {
  const map = useMap()
  const maps = useMapsLibrary('maps')
  const routesLib = useMapsLibrary('routes')
  const [lines, setLines] = useState<(google.maps.Polyline | null)[]>([])

  useEffect(() => {
    if (!map || !maps) return
    // 主題換了地圖會整個重掛，所以這裡讀到的是新主題的顏色
    const color = getComputedStyle(document.documentElement).getPropertyValue('--zg-flow').trim() || '#0b7285'
    const made = legs.map((leg) => {
      const walk = leg.mode === 'walk'
      return new maps.Polyline({
        map,
        path: [pts[leg.i], pts[leg.i + 1]],
        strokeColor: color,
        strokeOpacity: walk ? 0 : 0.9,
        strokeWeight: 4,
        icons: walk ? [{ ...DASH, icon: { ...DASH.icon, strokeColor: color } }] : undefined,
      })
    })
    setLines(made)
    return () => made.forEach((l) => l.setMap(null))
  }, [map, maps, legs, pts, theme])

  useEffect(() => {
    if (lines.length !== legs.length) return
    let stale = false
    legs.forEach((leg, k) => {
      if (leg.mode !== 'walk') return
      void walkPath(routesLib, walkKey(jobId, rank, leg.i), pts[leg.i], pts[leg.i + 1]).then((path) => {
        if (!stale && path) lines[k]?.setPath(path)
      })
    })
    return () => { stale = true }
  }, [lines, legs, pts, routesLib, jobId, rank])
  return null
}

export default function GoogleRoute({ nodes, rank, jobId, selected, onSelect, onError, onUnavailable }: {
  nodes: RouteNode[]
  rank: number
  jobId: string
  selected: number | null
  onSelect: (n: number) => void
  onError: () => void
  onUnavailable: (why: string) => void
}) {
  // 金鑰無效、沒開帳單時，Google 會呼叫 window.gm_authFailure，地圖本身只顯示灰色錯誤；改成我們的降級說明
  useEffect(() => {
    const w = window as typeof window & { gm_authFailure?: () => void }
    w.gm_authFailure = onError
    return () => { delete w.gm_authFailure }
  }, [onError])
  return (
    <APIProvider apiKey={KEY!} language="zh-TW" region="TW" onError={onError}>
      <Located nodes={nodes} rank={rank} jobId={jobId} selected={selected} onSelect={onSelect} onUnavailable={onUnavailable} />
    </APIProvider>
  )
}

function Located({ nodes, rank, jobId, selected, onSelect, onUnavailable }: Omit<Parameters<typeof GoogleRoute>[0], 'onError'>) {
  const { camera, cameraFor, setCamera } = useMapStore()
  const theme = resolveTheme(useThemeStore((s) => s.pref), useSystemDark())
  const pts = useLocations(nodes, onUnavailable)
  const legs = useMemo(() => routeLegs(nodes), [nodes])
  if (!pts) return <div className="grid h-72 place-items-center rounded-lg bg-muted text-xs text-muted-foreground">地圖載入中…</div>
  const all = pts as LatLng[]
  const lats = all.map((p) => p.lat)
  const lngs = all.map((p) => p.lng)
  const bounds = { north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs), padding: 40 }
  // 同一個方案切回地圖時，回到使用者剛剛看的位置；換了方案就重新對準整條路線
  const keep = camera && cameraFor === rank ? { defaultCenter: camera.center, defaultZoom: camera.zoom } : { defaultBounds: bounds }

  return (
    // colorScheme 只在掛上時生效，所以主題換了就整個重掛
    <Map
      key={theme}
      {...keep}
      mapId={MAP_ID}
      colorScheme={theme === 'night' ? 'DARK' : 'LIGHT'}
      gestureHandling="cooperative"
      disableDefaultUI
      zoomControl
      className="h-72 w-full overflow-hidden rounded-lg"
      onCameraChanged={(e: MapCameraChangedEvent) => setCamera(rank, { center: e.detail.center, zoom: e.detail.zoom })}
    >
      <Lines legs={legs} pts={all} jobId={jobId} rank={rank} theme={theme} />
      {legs.filter((l) => l.mode === 'train' && l.label).map((l) => (
        <AdvancedMarker key={`line-${l.i}`} position={midpoint(all[l.i], all[l.i + 1])} zIndex={1} clickable={false}>
          <span className="rounded-full bg-background/90 px-2 py-0.5 text-[11px] shadow">{l.label}</span>
        </AdvancedMarker>
      ))}
      {nodes.map((n, i) => (
        <AdvancedMarker key={n.n} position={all[i]} title={`第 ${n.n} 站 ${n.name}`} onClick={() => onSelect(n.n)} zIndex={selected === n.n ? 10 : n.n + 1}>
          <span
            className={cn(
              'grid size-7 place-items-center rounded-full border-2 text-xs font-semibold shadow',
              selected === n.n ? 'border-white bg-[#111827] text-white' : 'border-[#111827] bg-white text-[#111827]',
            )}
          >
            {n.n}
          </span>
        </AdvancedMarker>
      ))}
    </Map>
  )
}
