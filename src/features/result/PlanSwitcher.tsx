import type React from 'react'
import { motion } from 'motion/react'
import type { Proposal } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { bufferLevel, LEVEL_LABEL } from '@/shared/lib/buffer'
import { formatMoney } from '@/shared/lib/format'
import { desktopOrder, planBadge, planTag } from './labels'

const LEVEL_TEXT = { roomy: 'text-zg-ok', snug: 'text-zg-snug', tight: 'text-zg-tight' }

/**
 * 三張方案摘要卡（Q20、Q64）。
 * 桌機：橫排、第一名置中稍大；手機：可左右滑，第一名在最左。點哪張，下方時間軸就換哪個。
 */
export function PlanSwitcher({ plans, selected, onSelect, stationName }: {
  plans: Proposal[]
  selected: number
  onSelect: (rank: number) => void
  stationName: string
}) {
  const desktop = desktopOrder(plans)
  return (
    <div role="radiogroup" aria-label="選擇方案" className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:items-center sm:overflow-visible sm:px-0">
      {plans.map((p) => {
        const level = bufferLevel(p.summary.min_buffer_minutes)
        const active = p.rank === selected
        return (
          <motion.button
            key={p.rank}
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(p.rank)}
            layout
            style={{ '--o': desktop.indexOf(p) } as React.CSSProperties}
            className={cn(
              'zg-surface relative w-64 shrink-0 snap-start p-4 text-left transition-[border-color,box-shadow] sm:w-auto sm:[order:var(--o)]',
              p.rank === 1 && 'sm:py-6',
              active ? 'border-foreground ring-2 ring-foreground/80 cine:border-primary cine:ring-primary' : 'opacity-80 hover:opacity-100',
            )}
          >
            <span className="flex items-center gap-2">
              <span className="text-base font-semibold">{planTag(p)}</span>
              {planBadge(p) && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">{planBadge(p)}</span>
              )}
            </span>
            <span className="zg-num mt-3 block text-xl font-semibold">
              {p.summary.departure_time}
              <span className="mx-1.5 text-muted-foreground">→</span>
              {p.summary.return_time}
            </span>
            <span className="block text-xs text-muted-foreground">出門 → 回到{stationName}</span>
            <span className="mt-3 flex justify-between text-sm">
              <span>
                每人 <span className="zg-num font-medium">{formatMoney(p.summary.total_cost_per_person)}</span>
              </span>
              <span className={LEVEL_TEXT[level]}>
                最緊 <span className="zg-num font-medium">{p.summary.min_buffer_minutes}</span> 分・{LEVEL_LABEL[level]}
              </span>
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
