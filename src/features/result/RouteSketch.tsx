import { Footprints, Route, TrainFront } from 'lucide-react'
import type { Proposal } from '@/api/schemas'
import { placeUrl, routeUrl } from '@/shared/lib/maps'

type Node = { name: string; kind: string; via: 'train' | 'walk' | null }

/** 把時間軸上的地點去掉連續重複，變成路線上的站點 */
function toNodes(plan: Proposal): Node[] {
  const nodes: Node[] = []
  for (const s of plan.timeline_steps) {
    if (!s.place || nodes.at(-1)?.name === s.place.name) continue
    const prev = plan.timeline_steps[plan.timeline_steps.indexOf(s) - 1]
    nodes.push({ name: s.place.name, kind: s.place.kind, via: nodes.length === 0 ? null : prev?.type === '交通' ? 'train' : 'walk' })
  }
  return nodes
}

/**
 * 路線示意圖（Q28）：不是真實地圖比例，只畫「先到哪、再到哪」。
 * 點站點或下方按鈕都會開 Google 地圖（Q28b）。
 */
export function RouteSketch({ plan }: { plan: Proposal }) {
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
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`路線：${nodes.map((n) => n.name).join(' → ')}`}>
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
          <a key={i} href={placeUrl(n)} target="_blank" rel="noreferrer">
            <circle cx={pos[i].x} cy={pos[i].y} r={n.kind === 'station' ? 7 : 5.5} className={n.kind === 'station' ? 'fill-background stroke-foreground' : 'fill-zg-ok stroke-background cine:fill-primary'} strokeWidth="2.5" />
            <text x={pos[i].x + (i % 2 === 0 ? -14 : 14)} y={pos[i].y + 4} textAnchor={i % 2 === 0 ? 'end' : 'start'} className="fill-foreground text-[12px]">
              {n.name}
            </text>
          </a>
        ))}
      </svg>
      <a
        href={routeUrl(nodes)}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm hover:bg-muted"
      >
        <Route className="size-4" /> 在 Google 地圖查看完整路線
      </a>
    </div>
  )
}
