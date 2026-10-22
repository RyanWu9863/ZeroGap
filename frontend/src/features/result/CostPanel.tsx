import { Check, TriangleAlert } from 'lucide-react'
import type { CostKey, Plan } from '@/api/schemas'
import { formatMoney } from '@/shared/lib/format'
import { Money } from '@/shared/ui/Money'
import type { SwapView } from './swap'

const ITEMS: { key: CostKey; label: string }[] = [
  { key: 'ticket', label: '電影票' },
  { key: 'meal', label: '用餐' },
  { key: 'fare_go', label: '去程車資' },
  { key: 'fare_return', label: '回程車資' },
]

/**
 * 每人花費明細（Q57）：四項＋合計＋「✓ 未超過預算」（Q34：預算這道關卡在這裡打勾）。
 * 哪幾項是估計值看 plan.estimated（規格書 6.5）。
 * 換過電影或餐廳（D2）時，後端只給估計的總額：合計改成估計值，明細仍是原本方案的。
 */
export function CostPanel({ plan, budget, swapped }: { plan: Plan; budget: number; swapped: SwapView | null }) {
  const c = plan.cost_per_person
  const total = swapped ? swapped.total : c.total
  const anyEstimated = plan.estimated.length > 0
  const over = total > budget
  return (
    <div className="zg-surface p-4">
      <p className="text-sm font-medium">每人花費</p>
      <dl className="mt-3 space-y-2 text-sm">
        {ITEMS.map((i) => (
          <div key={i.key} className="flex items-center justify-between">
            <dt className="text-muted-foreground">{i.label}</dt>
            <dd className={swapped ? 'opacity-60' : undefined}>
              <Money amount={c[i.key]} estimated={plan.estimated.includes(i.key)} />
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
          <dt>合計</dt>
          <dd>{swapped ? <Money amount={total} estimated /> : <span className="zg-num">{(anyEstimated ? '約 ' : '') + formatMoney(total)}</span>}</dd>
        </div>
      </dl>
      {swapped && <p className="mt-2 text-xs text-muted-foreground">明細是原本的{swapped.original}；換成{swapped.name}只估計合計。</p>}
      {over ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-zg-tight-soft px-2.5 py-1 text-xs font-medium text-zg-tight">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          估計會超過預算 {formatMoney(budget)}
        </p>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-zg-ok-soft px-2.5 py-1 text-xs font-medium text-zg-ok">
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
          未超過預算 {formatMoney(budget)}，還剩 {formatMoney(budget - total)}
        </p>
      )}
      {(anyEstimated || swapped) && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="rounded bg-zg-est px-1 text-zg-est-ink">黃底</span> 為估計值
        </p>
      )}
    </div>
  )
}
