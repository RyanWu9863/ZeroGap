import { ChevronDown } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { useRequestLabels } from '@/api/labels'
import { useStatus } from '@/api/queries'
import type { Plan, PlanRequest, PlanResult } from '@/api/schemas'
import { useTiming } from '@/api/timing'
import { homeLabel } from '@/features/wizard/validation'
import { planTag } from '@/features/result/labels'
import { cn } from '@/lib/utils'
import { JEV_THRESHOLD } from '@/shared/lib/config'
import { formatDate, formatMoney } from '@/shared/lib/format'

type Event = { id: string; title: string; where: '瀏覽器' | '排程服務'; time: string | null; summary: string; detail: ReactNode }

const clock = (t: number) => new Date(t).toLocaleTimeString('zh-TW', { hour12: false })

const ITEMS = { movie: '電影', restaurant: '餐廳', route_go: '去程', route_return: '回程' } as const
const byLlm = (p: Plan) => (Object.keys(ITEMS) as (keyof typeof ITEMS)[]).filter((k) => p.decided_by[k] === 'llm').map((k) => ITEMS[k])

/**
 * 版本 B：決策時間軸。照系統真正的流程排（規格書 6.4 的階段）：
 * 瀏覽器送出 → 排程服務（五道關卡 → Jev 排序 → 沒把握時 LLM 代選 → 營業時間、精確班次）→ 回傳。
 * 時間只標瀏覽器量得到的（送出、收到、來回多久）；排程服務裡每一步沒有回傳時間，就寫「沒有回傳」，不編。
 * 只呈現輸入、規則、輸出這些查得到的東西，不寫模型的「思考過程」。
 */
export function DecisionTimeline({ request: r, result }: { request: PlanRequest; result: PlanResult }) {
  const timing = useTiming(r)
  const labels = useRequestLabels(r)
  const status = useStatus().data
  const [open, setOpen] = useState<string | null>(null)
  const { combinations, feasible } = result.stats
  const plans = result.plans
  const llm = plans.flatMap((p) => byLlm(p).map((item) => `${planTag(p)}的${item}`))
  const inside = '排程服務沒有回傳這一步的時間'
  const prefs = [labels.movie ? `電影：${labels.movie}` : '電影：幫我挑', labels.genre && `片型：${labels.genre}`, labels.hall && `影廳：${labels.hall}`, r.language && `語言：${r.language}`, `料理：${labels.cuisine ?? '不限'}`]

  const events: Event[] = [
    {
      id: 'send', title: '送出你的條件', where: '瀏覽器', time: timing ? clock(timing.sentAt) : null,
      summary: `${labels.station} → ${labels.area}・${formatDate(r.date)} ${r.earliest_departure}–${homeLabel(r.latest_home)}`,
      detail: <p>{r.order === 'movie_first' ? '看完再吃' : '先吃再看'}・每人 {formatMoney(r.budget_per_person)}・步行 ≤ {r.max_walk_minutes} 分・{prefs.filter(Boolean).join('・')}</p>,
    },
    {
      id: 'gates', title: '五道關卡篩選（Python）', where: '排程服務', time: null,
      summary: `${combinations.toLocaleString()} 種組合 → ${feasible.toLocaleString()} 種接得上`,
      detail: <p>五道關卡一起檢查；後端不回傳每一關各淘汰幾組，只給全部和接得上的組數。</p>,
    },
    {
      id: 'rank', title: 'Jev 排序', where: '排程服務', time: null,
      summary: `${feasible.toLocaleString()} 種裡挑出 ${plans.length} 個${status ? `（${status.jev.mode === 'mock' ? '模擬版' : status.jev.model ?? 'Jev'}）` : ''}`,
      detail: (
        <ul className="space-y-0.5">
          {plans.map((p) => (
            <li key={p.rank} className="zg-num">
              {planTag(p)}：選片 {p.probabilities.movie?.toFixed(2) ?? '—'} × 選餐廳 {p.probabilities.restaurant?.toFixed(2) ?? '—'} ＝ {p.score.toFixed(2)}
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'llm', title: '沒把握時交給本機 LLM', where: '排程服務', time: null,
      summary: llm.length ? `${llm.length} 項由 LLM 代選` : `每一項的最高機率都在 ${JEV_THRESHOLD.toFixed(2)} 以上，全部照 Jev`,
      detail: (
        <p>
          某一項的最高機率低於 {JEV_THRESHOLD.toFixed(2)} 時，由本機 LLM{status?.llm.model ? `（${status.llm.model}）` : ''} 從前 3 名代選，其他候選放進結果頁的「換一部／換一家」。
          {llm.length > 0 && <> 這次：{llm.join('、')}。</>}
        </p>
      ),
    },
    {
      id: 'verify', title: '確認營業時間、查精確班次', where: '排程服務', time: null,
      summary: `每個方案向交通部 TDX 查實際班次`,
      detail: (
        <ul className="space-y-0.5">
          {plans.map((p) => (
            <li key={p.rank}>
              {planTag(p)}：{p.restaurant.hours_verified ? '營業時間已核對' : '營業時間未確認'}・最緊的一段 {p.min_buffer_minutes} 分
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'recv', title: '收到結果', where: '瀏覽器', time: timing ? clock(timing.sentAt + timing.ms) : null,
      summary: timing ? `來回 ${(timing.ms / 1000).toFixed(1)} 秒・${timing.source === 'mock' ? '假資料（開發用）' : '排程服務'}` : '這份結果是先前排好的，沒有量到這次的時間',
      detail: <p>回傳 {plans.length} 個方案：{plans.map(planTag).join('、')}</p>,
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
