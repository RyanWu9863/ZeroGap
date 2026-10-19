import { Check, X } from 'lucide-react'
import type { ItineraryResponse } from '@/api/schemas'

function Meter({ v }: { v: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${v * 100}%`, background: 'var(--zg-chart-keep)' }} />
      </span>
      <span className="zg-num">{v.toFixed(2)}</span>
    </span>
  )
}

/** 系統幕後 ②下半：Jev 機率拆解＋閥門（Q65）。這裡才會出現「Jev」和機率（Q16）。 */
export function ProbabilityTable({ data }: { data: ItineraryResponse }) {
  const g = data.confidence_gate
  const plans = data.top_3_proposals.length ? data.top_3_proposals : data.alternatives
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-normal">方案（rank_label）</th>
              <th className="font-normal">選片機率</th>
              <th className="font-normal">選餐廳機率</th>
              <th className="font-normal">組合信心度</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.rank} className="border-t">
                <td className="py-2">{p.rank_label}</td>
                <td><Meter v={p.confidence_breakdown.movie_prob} /></td>
                <td><Meter v={p.confidence_breakdown.restaurant_prob} /></td>
                <td><Meter v={p.confidence_breakdown.combined} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        置信度閥門 <span className="zg-num">{g.threshold.toFixed(2)}</span>：
        {g.passed ? (
          <span className="inline-flex items-center gap-1 text-zg-ok"><Check className="size-4" />通過，直接採用排序</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-zg-tight">
            <X className="size-4" />未通過{g.uncertain_field ? `，不確定的是${g.uncertain_field === 'movie' ? '電影' : '餐廳'}，改問使用者` : ''}
          </span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">組合信心度 = 選片機率 × 選餐廳機率。閥門要用在哪一步仍待定（AI_CONTEXT 待決 Q1）。</p>
    </div>
  )
}
