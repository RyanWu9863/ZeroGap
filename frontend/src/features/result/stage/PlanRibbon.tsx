import type { Plan, TimelineStep } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { ribbon } from './planFacts'

const COLOR: Record<TimelineStep['type'], string> = {
  transit: 'bg-muted-foreground/45',
  walk: 'bg-muted-foreground/20',
  wait: 'bg-muted-foreground/10',
  movie: 'bg-primary',
  meal: 'bg-zg-ok',
  home: 'bg-transparent',
}

const LEGEND: { type: TimelineStep['type']; label: string }[] = [
  { type: 'transit', label: '搭車' },
  { type: 'walk', label: '走路' },
  { type: 'movie', label: '電影' },
  { type: 'meal', label: '用餐' },
]

/**
 * 每個方案自己的主視覺：整趟行程的時間比例緞帶（資料全來自時間軸）。
 * 沒有真實照片素材，Q43 也定了「程式畫的，不用插畫」，所以用行程本身畫。
 */
export function PlanRibbon({ plan, legend, className }: { plan: Plan; legend?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {ribbon(plan).map((s, i) => (
          <span
            key={i}
            className={cn('absolute inset-y-0 border-r border-background/70', COLOR[s.type])}
            style={{ left: `${s.start * 100}%`, width: `${s.length * 100}%` }}
          />
        ))}
      </div>
      {legend && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-hidden="true">
          {LEGEND.map((l) => (
            <span key={l.type} className="inline-flex items-center gap-1">
              <span className={cn('size-2 rounded-full', COLOR[l.type])} />
              {l.label}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
