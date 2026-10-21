import { Footprints, Route, TrainFront } from 'lucide-react'
import type { Place, Plan } from '@/api/schemas'
import { SourceCredit } from '@/shared/brand/Attribution'
import { placeUrl, routeUrl } from '@/shared/lib/maps'
import { placeName } from '@/shared/lib/steps'

type Node = Place & { label: string; via: 'train' | 'walk' | null }

/**
 * 把時間軸上的地點去掉連續重複，變成路線上的站點。
 * transit 的 place 是上車的地點，所以「到下一個地點」的那一段，交通方式看的是上一步。
 */
function toNodes(plan: Plan): Node[] {
  const nodes: Node[] = []
  plan.timeline.forEach((s, i) => {
    const prev = nodes.at(-1)
    if (!s.place || (prev && prev.kind === s.place.kind && prev.id === s.place.id)) return
    const before = plan.timeline[i - 1]
    nodes.push({ ...s.place, label: placeName(s.place), via: nodes.length === 0 ? null : before?.type === 'transit' ? 'train' : 'walk' })
  })
  return nodes
}

/**
 * 路線示意圖（Q28）：不是真實地圖比例，只畫「先到哪、再到哪」。
 * 版面是不依座標的鋸齒排列：Google 來源的餐廳沒有座標，也不能被當成地圖畫（規格書 6.7）。
 * 點站點或下方按鈕都會開 Google 地圖（Q28b）；Google 來源的餐廳在卡片底部附標誌。
 */
export function RouteSketch({ plan }: { plan: Plan }) {
  const nodes = toNodes(plan)
  if (nodes.length < 2) return null
  const W = 300
  const gap = 64
  const H = (nodes.length - 1) * gap + 40
  const pos = nodes.map((_, i) => ({ x: i % 2 === 0 ? 115 : 185, y: 20 + i * gap }))
  return (
    <div className="zg-surface p-4">
      <p className="text-sm font-medium">路線示意</p>
      <p className="text-xs text-muted-foreground">非實際比例</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`路線：${nodes.map((n) => n.label).join(' → ')}`}>
        {pos.slice(1).map((p, i) => {
          const a = pos[i]
          const walk = nodes[i + 1].via === 'walk'
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={p.x} y2={p.y} stroke="currentColor" strokeWidth={walk ? 1.5 : 3} strokeDasharray={walk ? '4 5' : undefined} opacity={walk ? 0.55 : 0.9} />
              <foreignObject x={(a.x + p.x) / 2 - 9} y={(a.y + p.y) / 2 - 9} width="18" height="18">
                <span className="grid size-[18px] place-items-center rounded-full bg-background text-muted-foreground">
                  {walk ? <Footprints className="size-3" /> : <TrainFront className="size-3" />}
                </span>
              </foreignObject>
            </g>
          )
        })}
        {nodes.map((n, i) => (
          <a key={i} href={placeUrl({ ...n, name: n.label })} target="_blank" rel="noreferrer">
            {/* 透明的大圓：手指比較好點到站點（看不到，只是放大點擊範圍） */}
            <circle cx={pos[i].x} cy={pos[i].y} r={16} fill="transparent" />
            <circle cx={pos[i].x} cy={pos[i].y} r={n.kind === 'station' ? 7 : 5.5} className={n.kind === 'station' ? 'fill-background stroke-foreground' : 'fill-zg-ok stroke-background cine:fill-primary'} strokeWidth="2.5" />
            <text x={pos[i].x + (i % 2 === 0 ? -14 : 14)} y={pos[i].y + 4} textAnchor={i % 2 === 0 ? 'end' : 'start'} className="fill-foreground text-[12px]">
              {n.label}
            </text>
          </a>
        ))}
      </svg>
      <a
        href={routeUrl(nodes.map((n) => ({ ...n, name: n.label })))}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm hover:bg-muted"
      >
        <Route className="size-4" /> 在 Google 地圖查看完整路線
      </a>
      {plan.restaurant.source === 'google' && <SourceCredit source="google" className="mt-1" />}
    </div>
  )
}
