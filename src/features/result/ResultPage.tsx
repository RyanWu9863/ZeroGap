import { ArrowRight, Info } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useCuisineLabel, useRequestLabels } from '@/api/labels'
import { cancelPlan, requestKey, usePlanRun } from '@/api/planRuns'
import type { PlanRequest } from '@/api/schemas'
import { TrialSurvey } from '@/features/trial/TrialSurvey'
import { useTrialStore } from '@/features/trial/trialStore'
import { ConditionBar } from './ConditionBar'
import { CopyButton } from './CopyButton'
import { CostPanel } from './CostPanel'
import { FreshnessNote } from './FreshnessNote'
import { NoSolution } from './NoSolution'
import { PlanProgress } from './PlanProgress'
import { PlanSwitcher } from './PlanSwitcher'
import { ResultError } from './ResultStates'
import { RouteSketch } from './RouteSketch'
import { swapNotice, swapView, type Swap } from './swap'
import { Timeline } from './Timeline'
import { useResultState } from './useResultState'

const NO_PLAN = ['NO_FEASIBLE', 'NO_SHOWTIMES']

/**
 * 結果頁（Q13b）：等待畫面 → 條件摘要 → 漏斗一行字 → 方案切換 → 大時間軸＋右欄（路線、花費、動作）。
 * 規劃走 POST /api/plans 的 SSE（規格書 6.4），由 api/planRuns.ts 管：
 * - 從精靈按「排出行程」進來（replay）一定重新規劃；重新整理直接用瀏覽器存的結果、不重播（Q62）
 * - 無解（NO_FEASIBLE、NO_SHOWTIMES）→ 放寬建議（Q23）；其他錯誤 → 白話說明＋重試
 * - 系統拿不定時不另外插一頁：結果頁時間軸上直接「換一部／換一家」（D2）
 * 條件同步在網址上（Q62）。
 */
export function ResultPage() {
  const { request, rank, update, choosePlan } = useResultState()
  const location = useLocation()
  const navigate = useNavigate()
  const replay = Boolean((location.state as { replay?: boolean } | null)?.replay)
  const { run, retry } = usePlanRun(request, replay)
  const key = requestKey(request)
  const labels = useRequestLabels(request)
  const cuisineLabel = useCuisineLabel()
  const finished = run?.status === 'done' || run?.status === 'failed'

  // 看著跑完的那組條件，等待畫面停一下再換頁；重新整理直接拿到結果的，不用等（React「依前一次的值調整 state」寫法）
  const [watching, setWatching] = useState<string | null>(null)
  if (!finished && watching !== key) setWatching(key)
  const showProgress = !finished || watching === key
  const done = useCallback(() => {
    setWatching(null)
    // 清掉「重新規劃」記號，重新整理才不會再跑一次；網址上的查詢參數要保留
    if (replay) navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
  }, [replay, navigate, location.pathname, location.search])
  const cancel = () => {
    cancelPlan(request)
    navigate('/plan/4')
  }

  // 換一部／換一家（D2）：只對這組條件、這個方案有效，一次只換一項
  const [swaps, setSwaps] = useState<{ key: string; byRank: Record<number, Swap | null> }>({ key, byRank: {} })
  const swapsHere = swaps.key === key ? swaps.byRank : {}
  const setSwap = (r: number, s: Swap | null) => setSwaps({ key, byRank: { ...swapsHere, [r]: s } })

  const result = run?.status === 'done' ? run.result : null
  const plans = result?.plans ?? []
  // 試用計時：方案真的出現在畫面上才算「拿到行程」（Q79）
  const markTrial = useTrialStore((s) => s.mark)
  const showingPlans = !showProgress && plans.length > 0
  useEffect(() => {
    if (showingPlans) markTrial('resultAt')
  }, [showingPlans, markTrial])

  // 無解的一鍵放寬、結果頁的小視窗改條件，都會用新條件重新規劃
  const rerun = (patch: Partial<PlanRequest>) => update(patch)

  if (showProgress) return <PlanProgress key={key} request={request} run={run} onDone={done} onCancel={cancel} />
  if (run?.status === 'failed') {
    if (run.error && NO_PLAN.includes(run.error.code)) return <NoSolution request={request} error={run.error} onRelax={rerun} />
    return <ResultError error={run.error} onRetry={retry} />
  }
  if (!result || plans.length === 0) return <ResultError error={null} onRetry={retry} />

  const plan = plans.find((p) => p.rank === rank) ?? plans[0]
  const swapOf = (r: number) => {
    const p = plans.find((x) => x.rank === r)
    return p ? swapView(p, swapsHere[r], cuisineLabel) : null
  }
  const swapped = swapOf(plan.rank)
  const n = plans.length

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <ConditionBar req={request} onApply={rerun} />
      <h1 className="mt-6 text-2xl font-bold sm:text-3xl cine:font-semibold lin:font-semibold">{n === 1 ? '這個行程' : `這 ${n} 個行程`}，每一段都接得上。</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        從 <span className="zg-num">{result.stats.combinations.toLocaleString()}</span> 種組合中，找到{' '}
        <span className="zg-num">{result.stats.feasible.toLocaleString()}</span> 種每段都接得上的行程，挑出最適合你的 {n} 個。
      </p>

      <div className="mt-6">
        <PlanSwitcher plans={plans} selected={plan.rank} onSelect={choosePlan} stationName={labels.station} date={request.date} swapOf={swapOf} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section className="zg-surface min-w-0 p-5 sm:p-8">
          {plan.highlight && <p className="mb-6 text-sm text-muted-foreground">{plan.highlight.reason}</p>}
          {swapped && (
            <p className="mb-6 flex items-start gap-2 rounded-lg bg-zg-est px-3 py-2 text-sm text-zg-est-ink" role="status">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {swapNotice(swapped)}
            </p>
          )}
          <Timeline plan={plan} date={request.date} stationName={labels.station} swap={swapsHere[plan.rank] ?? null} onSwap={(s) => setSwap(plan.rank, s)} />
        </section>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <RouteSketch plan={plan} />
          <CostPanel plan={plan} budget={request.budget_per_person} swapped={swapped} />
          <CopyButton request={request} plan={plan} swapped={swapped} className="hidden lg:block" />
          <Link to="/behind" className="flex items-center justify-center gap-1 py-2 text-sm text-muted-foreground hover:text-foreground">
            看系統怎麼挑的 <ArrowRight className="size-3.5" />
          </Link>
        </aside>
      </div>

      <div className="mt-10">
        <FreshnessNote />
      </div>

      <TrialSurvey />

      {/* 手機：「複製行程」固定在底部（Q64） */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 p-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <CopyButton request={request} plan={plan} swapped={swapped} className="w-full" />
      </div>
    </div>
  )
}
