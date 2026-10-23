import { Footprints, TrainFront } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RouteNode } from './route'

const W = 300
const GAP = 64

/**
 * 簡潔路線圖：不是真實比例，只畫「先到哪、再到哪」（Q28）。
 * 每一站有編號，搭車是實線、走路是虛線。線和圓圈畫在 SVG 裡（純裝飾）；
 * 每一站是疊在上面的真正按鈕，滑鼠、手指、鍵盤、螢幕閱讀器都點得到，範圍涵蓋圓圈和站名。
 */
export function SketchRoute({ nodes, selected, onSelect }: { nodes: RouteNode[]; selected: number | null; onSelect: (n: number) => void }) {
  const H = (nodes.length - 1) * GAP + 40
  const pos = nodes.map((_, i) => ({ x: i % 2 === 0 ? 110 : 190, y: 20 + i * GAP }))
  return (
    <div className="relative w-full md:mx-auto md:max-w-xs" role="group" aria-label={`路線：${nodes.map((n) => `${n.n}. ${n.name}`).join(' → ')}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" aria-hidden="true">
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
        {nodes.map((n, i) => {
          const on = selected === n.n
          const left = i % 2 === 0
          return (
            <g key={n.n}>
              <circle cx={pos[i].x} cy={pos[i].y} r={11} strokeWidth={on ? 3 : 2} className={on ? 'fill-primary stroke-primary' : 'fill-background stroke-foreground'} />
              <text x={pos[i].x} y={pos[i].y + 4} textAnchor="middle" className={cn('zg-num text-[11px] font-semibold', on ? 'fill-primary-foreground' : 'fill-foreground')}>
                {n.n}
              </text>
              <text x={pos[i].x + (left ? -18 : 18)} y={pos[i].y + 4} textAnchor={left ? 'end' : 'start'} className={cn('fill-foreground text-[12px]', on && 'font-semibold')}>
                {n.name}
              </text>
            </g>
          )
        })}
      </svg>
      {nodes.map((n, i) => {
        const left = i % 2 === 0
        const x0 = left ? pos[i].x - 110 : pos[i].x - 18
        return (
          <button
            key={n.n}
            type="button"
            aria-pressed={selected === n.n}
            aria-label={`第 ${n.n} 站 ${n.name}，${n.from === n.to ? n.from : `${n.from}–${n.to}`}`}
            onClick={() => onSelect(n.n)}
            className="absolute rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left: `${(x0 / W) * 100}%`, top: `${((pos[i].y - 18) / H) * 100}%`, width: `${(128 / W) * 100}%`, height: `${(36 / H) * 100}%` }}
          />
        )
      })}
    </div>
  )
}
