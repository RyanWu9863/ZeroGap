import { BusFront, Clapperboard, Footprints, Hourglass, MapPinCheck, TrainFront, UtensilsCrossed } from 'lucide-react'
import type { TimelineStep } from '@/api/schemas'
import { cn } from '@/lib/utils'

type StepType = TimelineStep['type']

const ICONS = { transit: TrainFront, walk: Footprints, movie: Clapperboard, wait: Hourglass, meal: UtensilsCrossed, home: MapPinCheck }
const LABELS: Record<StepType, string> = { transit: '交通', walk: '步行', movie: '電影', wait: '候位', meal: '用餐', home: '回到車站' }

/** 時間軸上每一步的圖示（Lucide 線條圖示，Q83）。交通是公車或客運時換成公車圖示 */
export function StepIcon({ type, bus = false, className }: { type: StepType; bus?: boolean; className?: string }) {
  const Icon = type === 'transit' && bus ? BusFront : ICONS[type]
  const label = type === 'transit' && bus ? '公車' : LABELS[type]
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full border bg-card text-foreground',
        type === 'home' && 'border-zg-ok text-zg-ok',
        className,
      )}
      title={label}
    >
      <Icon className="size-4" aria-label={label} />
    </span>
  )
}
