import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useItineraries } from '@/api/queries'
import { stationLabel } from '@/shared/lib/format'
import { usePlanStore } from '@/store/planStore'
import { ConditionBar } from './ConditionBar'
import { CopyButton } from './CopyButton'
import { CostPanel } from './CostPanel'
import { FreshnessNote } from './FreshnessNote'
import { PlanSwitcher } from './PlanSwitcher'
import { ResultError, ResultLoading } from './ResultStates'
import { RouteSketch } from './RouteSketch'
import { Timeline } from './Timeline'

/**
 * 結果頁（Q13b）：條件摘要 → 漏斗一行字 → 三方案切換 → 大時間軸＋右欄（路線、花費、動作）。
 * 無解（Q23）和低信心挑選頁（Q22、Q87）在第 7–8 天補上。
 */
export function ResultPage() {
  const { request, selectedRank, selectRank } = usePlanStore()
  const { data, isPending, isError, refetch } = useItineraries(request)
  const station = stationLabel(request.origin_station)

  if (isPending) return <ResultLoading />
  if (isError) return <ResultError onRetry={() => refetch()} />
  if (data.result_status === 'no_solution') return <p className="py-32 text-center">（無解畫面施工中）</p>

  const plans = data.top_3_proposals
  const plan = plans.find((p) => p.rank === selectedRank) ?? plans[0]
  const f = data.funnel_stats

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <ConditionBar req={request} />
      <h1 className="mt-6 text-2xl font-bold sm:text-3xl cine:font-semibold">這 3 個行程，每一段都接得上。</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        從 <span className="zg-num">{f.total_checked.toLocaleString()}</span> 種組合中，找到{' '}
        <span className="zg-num">{f.feasible_count}</span> 種每段都接得上的行程，挑出最適合你的 {f.returned_count} 個。
      </p>

      <div className="mt-6">
        <PlanSwitcher plans={plans} selected={plan.rank} onSelect={selectRank} stationName={station} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section className="zg-surface p-5 sm:p-8">
          {plan.highlight && <p className="mb-6 text-sm text-muted-foreground">{plan.highlight.reason}</p>}
          <Timeline plan={plan} stationName={station} />
        </section>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <RouteSketch plan={plan} />
          <CostPanel plan={plan} budget={request.budget_per_person} />
          <CopyButton request={request} plan={plan} className="hidden lg:block" />
          <Link to="/behind" className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            看系統怎麼挑的 <ArrowRight className="size-3.5" />
          </Link>
        </aside>
      </div>

      <div className="mt-10">
        <FreshnessNote />
      </div>

      {/* 手機：「複製行程」固定在底部（Q64） */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 p-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <CopyButton request={request} plan={plan} className="w-full" />
      </div>
    </div>
  )
}
