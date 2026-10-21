import type { Plan, PlanResult } from '@/api/schemas'
import { JEV_THRESHOLD } from '@/shared/lib/config'
import { planTag } from '@/features/result/labels'

function Meter({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-muted-foreground">—</span>
  const low = v < JEV_THRESHOLD
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${Math.min(v, 1) * 100}%`, background: low ? 'var(--zg-chart-drop)' : 'var(--zg-chart-keep)' }} />
      </span>
      <span className="zg-num">{v.toFixed(2)}</span>
    </span>
  )
}

const ITEMS = { movie: '電影', restaurant: '餐廳', route_go: '去程', route_return: '回程' } as const

/** 哪幾項由 LLM 代選 */
function byLlm(p: Plan): string {
  const llm = (Object.keys(ITEMS) as (keyof typeof ITEMS)[]).filter((k) => p.decided_by[k] === 'llm').map((k) => ITEMS[k])
  return llm.length ? `LLM 代選：${llm.join('、')}` : '全部由 Jev 決定'
}

/**
 * 系統幕後 ②下半：Jev 機率拆解（Q65）。這裡才會出現「Jev」和機率（Q16）。
 * score＝選片機率 × 選餐廳機率，只用來顯示；最高機率低於門檻的項目由 LLM 從前 3 名代選（規格書 3.1、6.5）。
 */
export function ProbabilityTable({ data }: { data: PlanResult }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-normal">方案</th>
              <th className="font-normal">選片機率</th>
              <th className="font-normal">選餐廳機率</th>
              <th className="font-normal">組合分數</th>
              <th className="font-normal">誰決定</th>
            </tr>
          </thead>
          <tbody>
            {data.plans.map((p) => (
              <tr key={p.rank} className="border-t">
                <td className="py-2">{planTag(p)}</td>
                <td className="pr-4"><Meter v={p.probabilities.movie} /></td>
                <td className="pr-4"><Meter v={p.probabilities.restaurant} /></td>
                <td className="zg-num pr-4">{p.score.toFixed(2)}</td>
                <td className="text-xs">{byLlm(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        組合分數 = 選片機率 × 選餐廳機率。某一項的最高機率低於 <span className="zg-num">{JEV_THRESHOLD.toFixed(2)}</span> 時，由本機 LLM 從前 3 名代選，
        其他候選放進結果頁的「換一部／換一家」。指定了電影時，選片機率當作 1。
      </p>
    </div>
  )
}
