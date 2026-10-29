import { Clapperboard, Clock, UtensilsCrossed } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Plan } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { bufferLevel, LEVEL_LABEL } from '@/shared/lib/buffer'
import { formatMoney } from '@/shared/lib/format'
import { clockOn } from '@/shared/lib/time'
import { planBadge, planTag } from '../labels'
import { planFigures, type SwapView } from '../swap'
import { planFacts } from './planFacts'
import { PlanRibbon } from './PlanRibbon'

const LEVEL_TEXT = { roomy: 'text-zg-ok', snug: 'text-zg-snug', tight: 'text-zg-tight' }

/** 估計值的黃底（卡片本身是按鈕，裡面不能再放 Money 的 ⓘ 按鈕；同 PlanSwitcher） */
const Est = ({ children }: { children: ReactNode }) => (
  <span className="rounded bg-zg-est px-1 text-zg-est-ink" data-estimated="true">
    約 {children}
  </span>
)

/**
 * 方案卡的內容（舞台卡、手機卡、詳情標題共用）。
 * 標籤、推薦理由都是後端給的（Q60、規格書 6.5）；「最推薦」只標第一名（Q16：不寫 AI）。
 * 換過電影或餐廳（D2），到家時間和每人花費改成備選的估計值（黃底）。
 */
export function PlanCardBody({ plan, stationName, date, swapped, size = 'md' }: {
  plan: Plan
  stationName: string
  /** 使用者選的日期，跨午夜的時刻才標得出「隔天」 */
  date: string
  swapped: SwapView | null
  size?: 'md' | 'lg'
}) {
  const f = planFacts(plan)
  const fig = planFigures(plan, swapped)
  const level = bufferLevel(plan.min_buffer_minutes)
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
        {clockOn(plan.depart_at, date)}
        <span className="mx-1.5 text-muted-foreground">→</span>
        {swapped ? <Est>{clockOn(fig.homeAt, date)}</Est> : clockOn(fig.homeAt, date)}
      </span>
      <PlanRibbon plan={plan} legend={lg} />
      <span className="grid gap-1.5 text-sm">
        <span className="flex items-center gap-2">
          <Clapperboard className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">《{f.movie}》<span className="text-muted-foreground">・{f.theater}</span></span>
        </span>
        <span className="flex items-center gap-2">
          <UtensilsCrossed className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{f.restaurant}</span>
        </span>
        <span className="flex items-center gap-2">
          <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>全程 {f.duration}・回到{stationName}</span>
        </span>
      </span>
      <span className="flex items-baseline justify-between border-t pt-3 text-sm">
        <span>
          每人 <span className="zg-num font-semibold">{swapped ? <Est>{formatMoney(fig.total)}</Est> : formatMoney(fig.total)}</span>
        </span>
        <span className={LEVEL_TEXT[level]}>
          最緊 <span className="zg-num font-medium">{plan.min_buffer_minutes}</span> 分・{LEVEL_LABEL[level]}
        </span>
      </span>
    </span>
  )
}
