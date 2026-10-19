import { Clapperboard, Footprints, MapPinCheck, TrainFront, UtensilsCrossed } from 'lucide-react'
import type { TimelineStep } from '@/api/schemas'
import { cn } from '@/lib/utils'

const ICONS = { 交通: TrainFront, 步行: Footprints, 電影: Clapperboard, 晚餐: UtensilsCrossed, 到家: MapPinCheck }
const LABELS = { 交通: '交通', 步行: '步行', 電影: '電影', 晚餐: '用餐', 到家: '回到車站' }

/** 時間軸上每一步的圖示（Lucide 線條圖示，Q83） */
export function StepIcon({ type, className }: { type: TimelineStep['type']; className?: string }) {
  const Icon = ICONS[type]
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full border bg-card text-foreground',
        type === '到家' && 'border-zg-ok text-zg-ok',
        className,
      )}
      title={LABELS[type]}
    >
      <Icon className="size-4" aria-label={LABELS[type]} />
    </span>
  )
}
