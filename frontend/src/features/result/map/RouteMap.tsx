import { ExternalLink, MapPinOff, Route } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import type { Plan } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { SourceCredit } from '@/shared/brand/Attribution'
import { placeUrl, routeUrl } from '@/shared/lib/maps'
import { HAS_MAPS_KEY, useMapStore, type MapMode } from './mapStore'
import { hasCoords, routeNodes } from './route'
import { SketchRoute } from './SketchRoute'

const GoogleRoute = lazy(() => import('./GoogleRoute'))
/** 沒有金鑰時給一般使用者看的白話；開發模式多一句怎麼設定 */
const NO_KEY_TEXT =
  '這個網站目前沒有開啟 Google 地圖，先用路線示意圖。' +
  (import.meta.env.DEV ? '（開發提示：在 frontend/.env 設定 VITE_GOOGLE_MAPS_KEY）' : '')

const MODES: { id: MapMode; label: string }[] = [
  { id: 'sketch', label: '路線示意' },
  { id: 'google', label: 'Google 地圖' },
]

/**
 * 行程路線（沉浸式新版 PR4；2026-11-07 起結果頁預設就用它，取代右欄的 RouteSketch）。
 * 兩種模式：Google 地圖（有金鑰時預設，可縮放、拖曳）／簡潔示意圖。切換時保留選中的站和地圖視角；換方案時跟著換。
 * 誠實標示：Google 地圖上的連線是站和站之間的直線，不是導航路線。
 * 座標只用後端給的；Google 來源的餐廳沒有座標（規格書 6.7），那種方案只能用示意圖。
 */
export function RouteMap({ plan, date }: { plan: Plan; date: string }) {
  const nodes = routeNodes(plan, date)
  const { mode, setMode } = useMapStore()
  const [picked, setPicked] = useState<{ rank: number; n: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const selected = picked?.rank === plan.rank ? picked.n : null // 換方案時清掉選中的站
  const select = (n: number) => setPicked({ rank: plan.rank, n })
  const node = nodes.find((x) => x.n === selected)
  if (nodes.length < 2) return null
  // 開 Google 地圖網頁：Google 來源的餐廳帶 place_id，其他有座標用座標（maps.ts）
  const linkable = nodes.map((x) => ({ ...x.place, name: x.name }))

  const fallback = !HAS_MAPS_KEY
    ? NO_KEY_TEXT
    : !hasCoords(nodes)
      ? '這個方案的餐廳資料來自 Google，沒有可以畫在地圖上的座標，先用路線示意圖。'
      : failed
        ? 'Google 地圖載入失敗（網路或金鑰設定），先用路線示意圖。'
        : null
  const showGoogle = mode === 'google' && !fallback

  return (
    <div className="zg-surface p-4" data-testid="route-map">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">行程路線</p>
        <div role="radiogroup" aria-label="地圖樣式" className="flex rounded-full border p-0.5 text-xs">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className="rounded-full px-2.5 py-1 aria-checked:bg-primary aria-checked:text-primary-foreground pointer-coarse:min-h-9"
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {showGoogle
          ? '站和站之間是直線示意，不是導航路線'
          : '非實際比例・實線搭車、虛線走路'}
      </p>

      {mode === 'google' && fallback && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs" role="status">
          <MapPinOff className="mt-0.5 size-3.5 shrink-0 text-zg-tight" aria-hidden="true" />
          {fallback}
        </p>
      )}

      <div className="mt-3">
        {showGoogle ? (
          <Suspense fallback={<div className="grid h-72 place-items-center rounded-lg bg-muted text-xs text-muted-foreground">Google 地圖載入中…</div>}>
            <GoogleRoute key={plan.rank} nodes={nodes} rank={plan.rank} selected={selected} onSelect={select} onError={() => setFailed(true)} />
          </Suspense>
        ) : (
          <SketchRoute nodes={nodes} selected={selected} onSelect={select} />
        )}
      </div>

      {/* 選中那一站的資訊（兩種模式共用，切換時不會不見） */}
      <div className={cn('mt-3 rounded-lg border px-3 py-2.5 text-sm', !node && 'border-dashed text-xs text-muted-foreground')} aria-live="polite">
        {node ? (
          <>
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-medium">
                {node.n}. {node.name}
              </span>
              <span className="zg-num text-xs text-muted-foreground">{node.from === node.to ? node.from : `${node.from}–${node.to}`}</span>
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {node.notes.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <a href={placeUrl(linkable[node.n - 1])} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs underline underline-offset-2">
              在 Google 地圖開啟這一站 <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </>
        ) : (
          '點站點看那一站的時間和要做的事'
        )}
      </div>

      <a href={routeUrl(linkable)} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm hover:bg-muted">
        <Route className="size-4" aria-hidden="true" /> 在 Google 地圖查看完整路線
      </a>
      {plan.restaurant.source === 'google' && <SourceCredit source="google" className="mt-1" />}
    </div>
  )
}
