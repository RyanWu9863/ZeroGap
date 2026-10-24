import { Check } from 'lucide-react'
import { motion } from 'motion/react'
import type { ItineraryRequest, ItineraryResponse, Proposal } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { gateLabels } from '@/shared/lib/gates'
import { formatMoney } from '@/shared/lib/format'

type Row = { label: string; value: (p: Proposal) => number; show: (p: Proposal) => string; better: 'high' | 'low'; bar?: boolean }

const ROWS: Row[] = [
  { label: '最緊的緩衝', value: (p) => p.summary.min_buffer_minutes, show: (p) => `${p.summary.min_buffer_minutes} 分`, better: 'high' },
  { label: '回到車站', value: (p) => Number(p.summary.return_time.replace(':', '')), show: (p) => p.summary.return_time, better: 'low' },
  { label: '每人花費', value: (p) => p.summary.total_cost_per_person, show: (p) => formatMoney(p.summary.total_cost_per_person), better: 'low' },
  { label: '選片機率', value: (p) => p.confidence_breakdown.movie_prob, show: (p) => p.confidence_breakdown.movie_prob.toFixed(2), better: 'high', bar: true },
  { label: '選餐廳機率', value: (p) => p.confidence_breakdown.restaurant_prob, show: (p) => p.confidence_breakdown.restaurant_prob.toFixed(2), better: 'high', bar: true },
  { label: '組合信心度', value: (p) => p.confidence_breakdown.combined, show: (p) => p.confidence_breakdown.combined.toFixed(2), better: 'high', bar: true },
]

/**
 * 版本 C：決策比較。入選的方案在五道關卡、緩衝、花費、Jev 機率上並排比，每一列標出最好的（文字標示，不只靠顏色）。
 * 沒入選和被淘汰的組合，後端沒有回傳個別資料（API 提案 #10），所以只列數量、明寫缺什麼。
 */
export function DecisionMatrix({ request, data }: { request: ItineraryRequest; data: ItineraryResponse }) {
  const plans = [...(data.top_3_proposals.length ? data.top_3_proposals : data.alternatives)].sort((a, b) => a.rank - b.rank)
  const f = data.funnel_stats
  if (!plans.length) return <p className="text-sm text-muted-foreground">這次沒有接得上的方案，沒有東西可以比較；請看「篩選漏斗」卡在哪一關。</p>
  const best = (r: Row) => (r.better === 'high' ? Math.max : Math.min)(...plans.map(r.value))
  const max = (r: Row) => Math.max(...plans.map(r.value), 0.0001)

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">比較項目</th>
              {plans.map((p) => (
                <th key={p.rank} className="px-2 font-normal">
                  <span className="block text-sm font-semibold text-foreground">{p.highlight?.label ?? p.rank_label}</span>
                  {p.rank_label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gateLabels(request).map((g) => (
              <tr key={g.id} className="border-t">
                <td className="py-1.5 pr-3 text-muted-foreground">{g.id}. {g.label}</td>
                {plans.map((p) => (
                  <td key={p.rank} className="px-2 text-zg-ok">
                    <span className="inline-flex items-center gap-1"><Check className="size-3.5" aria-hidden="true" />通過</span>
                  </td>
                ))}
              </tr>
            ))}
            {ROWS.map((r, ri) => (
              <tr key={r.label} className="border-t">
                <td className="py-2 pr-3 text-muted-foreground">{r.label}</td>
                {plans.map((p) => {
                  const top = r.value(p) === best(r)
                  return (
                    <td key={p.rank} className="px-2">
                      <span className={cn('zg-num inline-flex items-center gap-1.5', top && 'font-semibold')}>
                        {r.show(p)}
                        {top && <span className="rounded bg-primary px-1 text-[10px] font-medium text-primary-foreground">最佳</span>}
                      </span>
                      {r.bar && (
                        <span className="mt-1 block h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <motion.span className="block h-full rounded-full bg-[var(--zg-chart-keep)]" initial={{ width: 0 }} animate={{ width: `${(r.value(p) / max(r)) * 100}%` }} transition={{ delay: 0.1 + ri * 0.05, duration: 0.5 }} />
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <span className="zg-num">{f.total_checked.toLocaleString()}</span> 種組合裡，<span className="zg-num">{(f.total_checked - f.feasible_count).toLocaleString()}</span> 種被五道關卡淘汰、
        <span className="zg-num">{Math.max(f.feasible_count - plans.length, 0)}</span> 種接得上但沒入選。這些組合後端沒有回傳個別資料（API 提案 #10），所以不在這張表裡；排序依據是 Jev 的組合信心度和每個方案的特色標籤。
      </p>
    </div>
  )
}
