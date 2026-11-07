import { ArrowRight, Info } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useCuisineLabel, useRequestLabels } from '@/api/labels'
import { useSavedPlan } from '@/api/savedPlans'
import type { PlanRequest, SavedPlan } from '@/api/schemas'
import { PageLoading } from '@/app/PageLoading'
import { usePageTitle } from '@/shared/lib/usePageTitle'
import { usePlanStore } from '@/store/planStore'
import { ConditionBar } from './ConditionBar'
import { CostPanel } from './CostPanel'
import { FreshnessNote } from './FreshnessNote'
import { rerunPath } from './planPath'
import { PlanActions } from './PlanActions'
import { PlanDial } from './dial/PlanDial'
import { PlanSwitcher } from './PlanSwitcher'
import { ResultError } from './ResultStates'
import { RouteSketch } from './RouteSketch'
import { swapNotice, swapView, type Swap } from './swap'
import { Timeline } from './Timeline'
import { readRank } from './urlState'

const RouteMap = lazy(() => import('./map/RouteMap').then((m) => ({ default: m.RouteMap })))

/**
 * 排好的行程（/p/:id）：資料來自這台瀏覽器排過的，或後端存的那份（api/savedPlans.ts）。
 * 方案編號寫在 ?plan=（第 1 個不寫）；改條件會回到 /result 用新條件重排。
 */
export function PlanPage() {
  const { id = '' } = useParams()
  const { state, doc, retry } = useSavedPlan(id)
  usePageTitle('你的行程')
  if (state === 'loading') return <PageLoading />
  if (state === 'error') return <ResultError error={null} onRetry={retry} />
  if (!doc) return <PlanMissing />
  return <PlanView key={doc.job_id} doc={doc} />
}

/** 找不到這份行程（Task 7 換成正式的畫面） */
function PlanMissing() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">找不到這份行程，可能已經超過 7 天</h1>
      <Link to="/" className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg border px-5 text-sm hover:bg-muted">
        回首頁 <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}

function PlanView({ doc }: { doc: SavedPlan }) {
  const { request, result } = doc
  const location = useLocation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const replaceRequest = usePlanStore((s) => s.replaceRequest)
  const selectRank = usePlanStore((s) => s.selectRank)
  const labels = useRequestLabels(request)
  const cuisineLabel = useCuisineLabel()
  const plans = result.plans
  const rank = readRank(params) ?? 1
  const choosePlan = (r: number) => {
    selectRank(r)
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (r === 1) next.delete('plan')
        else next.set('plan', String(r))
        return next
      },
      { replace: true },
    )
  }

  // 換一部／換一家（D2）：只對這個方案有效，一次只換一項
  const [swaps, setSwaps] = useState<Record<number, Swap | null>>({})
  const setSwap = (r: number, s: Swap | null) => setSwaps((cur) => ({ ...cur, [r]: s }))

  // 改條件：記進瀏覽器暫存，回到 /result 用新條件重排
  const rerun = (patch: Partial<PlanRequest>) => {
    const next = { ...request, ...patch }
    replaceRequest(next)
    navigate(rerunPath(next, location.search), { state: { replay: true } })
  }

  if (plans.length === 0) return <ResultError error={null} onRetry={() => navigate(rerunPath(request, location.search), { state: { replay: true } })} />
  const plan = plans.find((p) => p.rank === rank) ?? plans[0]
  const swapOf = (r: number) => {
    const p = plans.find((x) => x.rank === r)
    return p ? swapView(p, swaps[r], cuisineLabel) : null
  }
  const swapped = swapOf(plan.rank)
  const n = plans.length

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <ConditionBar req={request} onApply={rerun} />
      <h1 className="mt-6 text-2xl font-bold sm:text-3xl">{n === 1 ? '這個行程' : `這 ${n} 個行程`}，每一段都接得上。</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        從 <span className="zg-num">{result.stats.combinations.toLocaleString()}</span> 種組合中，找到{' '}
        <span className="zg-num">{result.stats.feasible.toLocaleString()}</span> 種每段都接得上的行程，挑出最適合你的 {n} 個。
      </p>

      <div className="mt-6">
        <PlanSwitcher plans={plans} selected={plan.rank} onSelect={choosePlan} stationName={labels.station} date={request.date} swapOf={swapOf} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[20rem_1fr]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <PlanDial
            plan={plan}
            date={request.date}
            stationName={labels.station}
            onPrev={() => choosePlan(plans[(plans.findIndex((p) => p.rank === plan.rank) - 1 + n) % n].rank)}
            onNext={() => choosePlan(plans[(plans.findIndex((p) => p.rank === plan.rank) + 1) % n].rank)}
          />
        </div>
        <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[1fr_20rem]">
        <section className="zg-surface min-w-0 p-5 sm:p-8">
          {plan.highlight && <p className="mb-6 text-sm text-muted-foreground">{plan.highlight.reason}</p>}
          {swapped && (
            <p className="mb-6 flex items-start gap-2 rounded-lg bg-zg-est px-3 py-2 text-sm text-zg-est-ink" role="status">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {swapNotice(swapped)}
            </p>
          )}
          <Timeline plan={plan} date={request.date} stationName={labels.station} swap={swaps[plan.rank] ?? null} onSwap={(s) => setSwap(plan.rank, s)} />
        </section>
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          {/* 真實地圖預設就顯示（規格 D10）；地圖程式下載完前先用舊的示意圖 */}
          <Suspense fallback={<RouteSketch plan={plan} />}>
            <RouteMap plan={plan} date={request.date} />
          </Suspense>
          <CostPanel plan={plan} budget={request.budget_per_person} swapped={swapped} />
          <PlanActions doc={doc} plan={plan} swapped={swapped} stationName={labels.station} />
          <Link to="/behind" className="flex items-center justify-center gap-1 py-2 text-sm text-muted-foreground hover:text-foreground">
            看系統怎麼挑的 <ArrowRight className="size-3.5" />
          </Link>
        </aside>
        </div>
      </div>

      <div className="mt-10">
        <FreshnessNote />
      </div>

      {/* 手機：「分享連結」固定在底部（Q64） */}
      <div
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-30 border-t bg-background/90 p-3 backdrop-blur sm:bottom-0 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] lg:hidden"
      >
        <PlanActions compact doc={doc} plan={plan} swapped={swapped} stationName={labels.station} />
      </div>
    </div>
  )
}
