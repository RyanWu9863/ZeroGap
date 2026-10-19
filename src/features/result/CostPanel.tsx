import { Check } from 'lucide-react'
import type { CostItemKey, Proposal } from '@/api/schemas'
import { formatMoney } from '@/shared/lib/format'
import { Money } from '@/shared/ui/Money'

const ITEMS: { key: CostItemKey; label: string }[] = [
  { key: 'movie_ticket', label: '電影票' },
  { key: 'dining', label: '用餐' },
  { key: 'transit_outbound', label: '去程車資' },
  { key: 'transit_inbound', label: '回程車資' },
]

/** 每人花費明細（Q57）：四項＋合計＋「✓ 未超過預算」（Q34：預算這道關卡在這裡打勾） */
export function CostPanel({ plan, budget }: { plan: Proposal; budget: number }) {
  const total = plan.summary.total_cost_per_person
  const anyEstimated = ITEMS.some((i) => plan.cost_breakdown[i.key].is_estimated)
  return (
    <div className="zg-surface p-4">
      <p className="text-sm font-medium">每人花費</p>
      <dl className="mt-3 space-y-2 text-sm">
        {ITEMS.map((i) => (
          <div key={i.key} className="flex items-center justify-between">
            <dt className="text-muted-foreground">{i.label}</dt>
            <dd>
              <Money amount={plan.cost_breakdown[i.key].amount} estimated={plan.cost_breakdown[i.key].is_estimated} />
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
          <dt>合計</dt>
          <dd className="zg-num">{(anyEstimated ? '約 ' : '') + formatMoney(total)}</dd>
        </div>
      </dl>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-zg-ok-soft px-2.5 py-1 text-xs font-medium text-zg-ok">
        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        未超過預算 {formatMoney(budget)}，還剩 {formatMoney(budget - total)}
      </p>
      {anyEstimated && <p className="mt-2 text-xs text-muted-foreground"><span className="rounded bg-zg-est px-1 text-zg-est-ink">黃底</span> 為估計值</p>}
    </div>
  )
}
