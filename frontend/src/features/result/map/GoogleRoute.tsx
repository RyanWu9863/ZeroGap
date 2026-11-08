import { AdvancedMarker, APIProvider, Map, useMap, useMapsLibrary, type MapCameraChangedEvent } from '@vis.gl/react-google-maps'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useMapStore } from './mapStore'
import type { RouteNode } from './route'

/*
 * Google 地圖模式（使用者 10/23 選 Google Maps API）。這個檔案延遲載入，沒打開地圖模式不會下載。
 * - 金鑰：VITE_GOOGLE_MAPS_KEY（瀏覽器金鑰，請在 Google Cloud 限制網域）；不寫死在程式裡
 * - 地圖 ID：VITE_GOOGLE_MAPS_MAP_ID（編號標記需要）；沒設時用 Google 提供的 DEMO_MAP_ID
 * - 站和站之間畫「直線」，畫面上標明不是導航路線；要畫道路路線需要另外開 Routes API（未做）
 */
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID'

/** 站和站之間的直線：搭車實線、走路虛線 */
function StraightLines({ nodes }: { nodes: RouteNode[] }) {
  const map = useMap()
  const maps = useMapsLibrary('maps')
  useEffect(() => {
    if (!map || !maps) return
    const lines = nodes.slice(1).map((n, i) => {
      const walk = n.via === 'walk'
      return new maps.Polyline({
        map,
        path: [
          { lat: nodes[i].lat!, lng: nodes[i].lng! },
          { lat: n.lat!, lng: n.lng! },
        ],
        strokeColor: '#1f2937',
        strokeOpacity: walk ? 0 : 0.85,
        strokeWeight: 4,
        // 虛線：用重複的小線段當圖示
        icons: walk ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '12px' }] : undefined,
      })
    })
    return () => lines.forEach((l) => l.setMap(null))
  }, [map, maps, nodes])
  return null
}

export default function GoogleRoute({ nodes, rank, selected, onSelect, onError }: {
  nodes: RouteNode[]
  rank: number
  selected: number | null
  onSelect: (n: number) => void
  onError: () => void
}) {
  const { camera, cameraFor, setCamera } = useMapStore()
  // 金鑰無效、沒開帳單時，Google 會呼叫 window.gm_authFailure，地圖本身只顯示灰色錯誤；改成我們的降級說明
  useEffect(() => {
    const w = window as typeof window & { gm_authFailure?: () => void }
    w.gm_authFailure = onError
    return () => { delete w.gm_authFailure }
  }, [onError])
  const [bounds] = useState(() => {
    const lats = nodes.map((n) => n.lat!)
    const lngs = nodes.map((n) => n.lng!)
    return { north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs), padding: 40 }
  })
  // 同一個方案切回地圖時，回到使用者剛剛看的位置；換了方案就重新對準整條路線
  const keep = camera && cameraFor === rank ? { defaultCenter: camera.center, defaultZoom: camera.zoom } : { defaultBounds: bounds }

  return (
    <APIProvider apiKey={KEY!} language="zh-TW" region="TW" onError={onError}>
      <Map
        {...keep}
        mapId={MAP_ID}
        gestureHandling="cooperative"
        disableDefaultUI
        zoomControl
        className="h-72 w-full overflow-hidden rounded-lg"
        onCameraChanged={(e: MapCameraChangedEvent) => setCamera(rank, { center: e.detail.center, zoom: e.detail.zoom })}
      >
        <StraightLines nodes={nodes} />
        {nodes.map((n) => (
          <AdvancedMarker key={n.n} position={{ lat: n.lat!, lng: n.lng! }} title={`第 ${n.n} 站 ${n.name}`} onClick={() => onSelect(n.n)} zIndex={selected === n.n ? 10 : n.n}>
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
    </APIProvider>
  )
}
