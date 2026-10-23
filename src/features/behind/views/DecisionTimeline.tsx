import { ChevronDown } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import type { ItineraryRequest, ItineraryResponse } from '@/api/schemas'
import { useTiming } from '@/api/timing'
import { cn } from '@/lib/utils'
import { formatDate, formatMoney } from '@/shared/lib/format'

type Event = { id: string; title: string; where: '瀏覽器' | '排程服務'; time: string | null; summary: string; detail: ReactNode }

const clock = (t: number) => new Date(t).toLocaleTimeString('zh-TW', { hour12: false })

/**
 * 版本 B：決策時間軸。照系統真正的流程排：瀏覽器送出 → 排程服務（五道關卡 → Jev 排序 → 閥門）→ 回傳。
 * 時間只標瀏覽器量得到的（送出、收到、來回多久）；排程服務裡每一步沒有回傳時間，就寫「沒有回傳」，不編。
 * 只呈現輸入、規則、輸出這些查得到的東西，不寫模型的「思考過程」。
 */
export function DecisionTimeline({ request: r, data }: { request: ItineraryRequest; data: ItineraryResponse }) {
  const timing = useTiming(r)
  const [open, setOpen] = useState<string | null>(null)
  const f = data.funnel_stats
  const g = data.confidence_gate
  const plans = data.top_3_proposals.length ? data.top_3_proposals : data.alternatives
  const inside = '排程服務沒有回傳這一步的時間'

  const events: Event[] = [
    {
      id: 'send', title: '送出你的條件', where: '瀏覽器', time: timing ? clock(timing.sentAt) : null,
      summary: `${r.origin_station} → ${r.district_hub}・${formatDate(r.date)} ${r.earliest_departure}–${r.latest_return}`,
      detail: <p>{r.dining_order}・每人 {formatMoney(r.budget_per_person)}・步行 ≤ {r.max_walk_minutes} 分・電影：{r.movie_title}・料理：{r.cuisine_type}</p>,
    },
    {
      id: 'gates', title: '五道關卡篩選（Python）', where: '排程服務', time: null,
      summary: `${f.total_checked.toLocaleString()} 種組合 → ${f.feasible_count} 種接得上`,
      detail: f.by_filter ? (
        <ul className="space-y-0.5">{f.by_filter.map((b) => <li key={b.id} className="zg-num">{b.id}. {b.name}：淘汰 {b.eliminated.toLocaleString()}</li>)}</ul>
      ) : <p>沒有回傳每一關的剔除數（API 提案 #7）。</p>,
    },
    ...(data.no_solution ? [{
      id: 'none', title: '沒有接得上的組合', where: '排程服務' as const, time: null,
      summary: `卡在「${data.no_solution.blocking_filter.name}」`,
      detail: <ul>{data.no_solution.relax_suggestions.map((s) => <li key={s.field}>{s.field}：{s.current_value} → {s.suggested_value}（可找到 {s.feasible_count_after} 組）</li>)}</ul>,
    }] : [
      {
        id: 'rank', title: 'Jev 排序', where: '排程服務' as const, time: null,
        summary: `${f.feasible_count} 種裡挑出 ${f.returned_count} 個（${data.system_status.jev_mode}）`,
        detail: <ul className="space-y-0.5">{plans.map((p) => <li key={p.rank} className="zg-num">{p.rank_label}：選片 {p.confidence_breakdown.movie_prob.toFixed(2)} × 選餐廳 {p.confidence_breakdown.restaurant_prob.toFixed(2)} ＝ {p.confidence_breakdown.combined.toFixed(2)}</li>)}</ul>,
      },
      {
        id: 'gate', title: '置信度閥門', where: '排程服務' as const, time: null,
        summary: g.passed ? `通過（門檻 ${g.threshold.toFixed(2)}），直接採用排序` : `沒通過，改問使用者（${g.uncertain_field === 'movie' ? '電影' : '餐廳'}）`,
        detail: <p>LLM 狀態：{data.system_status.llm_status}。閥門沒過時，結果頁會先問使用者想看哪一部或吃哪一家。</p>,
      },
    ]),
    {
      id: 'recv', title: '收到回應', where: '瀏覽器', time: timing ? clock(timing.sentAt + timing.ms) : null,
      summary: timing ? `來回 ${(timing.ms / 1000).toFixed(1)} 秒・${timing.source === 'mock' ? '假資料（開發用）' : '排程服務'}` : '這份結果是先前排好的，沒有量到這次的時間',
      detail: <p>{data.result_status === 'ok' ? `回傳 ${plans.length} 個方案：${plans.map((p) => p.highlight?.label ?? p.rank_label).join('、')}` : '回傳放寬建議'}</p>,
    },
  ]

  return (
    <ol className="relative space-y-3 border-l pl-6" aria-label="決策時間軸">
      {events.map((e, i) => (
        <motion.li key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="relative">
          <span className={cn('absolute -left-[31px] top-3 size-3 rounded-full border-2 border-background', e.where === '瀏覽器' ? 'bg-muted-foreground' : 'bg-[var(--zg-chart-keep)]')} aria-hidden="true" />
          <div className="zg-surface">
            <button aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)} className="w-full p-3 text-left">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{e.title}</span>
                <span className="rounded-full border px-1.5 text-[11px] text-muted-foreground">{e.where}</span>
                <span className="zg-num ml-auto text-xs text-muted-foreground">{e.time ?? (e.where === '排程服務' ? inside : '')}</span>
                <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', open === e.id && 'rotate-180')} aria-hidden="true" />
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{e.summary}</span>
            </button>
            {open === e.id && <div className="mx-3 border-t py-2 text-xs">{e.detail}</div>}
          </div>
        </motion.li>
      ))}
    </ol>
  )
}
