import { Clapperboard, Clock, UtensilsCrossed } from 'lucide-react'
import type { Proposal } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { bufferLevel, LEVEL_LABEL } from '@/shared/lib/buffer'
import { formatMoney } from '@/shared/lib/format'
import { planBadge, planTag } from '../labels'
import { planFacts } from './planFacts'
import { PlanRibbon } from './PlanRibbon'

const LEVEL_TEXT = { roomy: 'text-zg-ok', snug: 'text-zg-snug', tight: 'text-zg-tight' }

/**
 * 方案卡的內容（舞台卡、手機卡、詳情標題共用）。
 * 標籤、推薦理由都是後端給的（Q60、提案 #3）；「最推薦」只標第一名（Q16：不寫 AI）。
 */
export function PlanCardBody({ plan, stationName, size = 'md' }: { plan: Proposal; stationName: string; size?: 'md' | 'lg' }) {
  const f = planFacts(plan)
  const level = bufferLevel(plan.summary.min_buffer_minutes)
  const lg = size === 'lg'
  return (
    <span className="flex flex-col gap-3">
      <span className="flex items-center gap-2">
        <span className={cn('font-semibold', lg ? 'text-2xl' : 'text-lg')}>{planTag(plan)}</span>
        {planBadge(plan) && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">{planBadge(plan)}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{f.order}</span>
      </span>
      {plan.highlight && <span className={cn('text-muted-foreground', lg ? 'text-base' : 'text-sm')}>{plan.highlight.reason}</span>}
      <span className={cn('zg-num font-semibold', lg ? 'text-4xl' : 'text-2xl')}>
        {plan.summary.departure_time}
        <span className="mx-1.5 text-muted-foreground">→</span>
        {plan.summary.return_time}
      </span>
      <PlanRibbon plan={plan} legend={lg} />
      <span className="grid grid-cols-[minmax(0,1fr)] gap-1.5 text-sm">
        {f.movie && (
          <span className="flex items-center gap-2">
            <Clapperboard className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0">《{f.movie}》{f.theater && <span className="text-muted-foreground">・{f.theater}</span>}</span>
          </span>
        )}
        {f.restaurant && (
          <span className="flex items-center gap-2">
            <UtensilsCrossed className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0">{f.restaurant}</span>
          </span>
        )}
        <span className="flex items-center gap-2">
          <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>全程 {f.duration}・回到{stationName}</span>
        </span>
      </span>
      <span className="flex items-baseline justify-between border-t pt-3 text-sm">
        <span>
          每人 <span className="zg-num font-semibold">{formatMoney(plan.summary.total_cost_per_person)}</span>
        </span>
        <span className={LEVEL_TEXT[level]}>
          最緊 <span className="zg-num font-medium">{plan.summary.min_buffer_minutes}</span> 分・{LEVEL_LABEL[level]}
        </span>
      </span>
    </span>
  )
}
