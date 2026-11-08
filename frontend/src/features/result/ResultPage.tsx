import { ArrowRight, LocateFixed } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { cancelPlan, requestKey, usePlanRun } from '@/api/planRuns'
import { JOB_ID_RE } from '@/api/savedPlans'
import type { PlanRequest } from '@/api/schemas'
import { isPastDate } from '@/shared/lib/dates'
import { usePageTitle } from '@/shared/lib/usePageTitle'
import { NoSolution } from './NoSolution'
import { PlanFunnel } from './PlanFunnel'
import { planPath } from './planPath'
import { ResultError } from './ResultStates'
import { StaleDate } from './StaleDate'
import { useResultState } from './useResultState'
import { usePlanStore } from '@/store/planStore'

const NO_PLAN = ['NO_FEASIBLE', 'NO_SHOWTIMES']

/**
 * 送出頁（/result）：只管「送出條件 → 等待畫面 → 失敗說明」，排好就換到 /p/編號（PlanPage）。
 * 規劃走 POST /api/plans 的 SSE（規格書 6.4），由 api/planRuns.ts 管：
 * - 從精靈按「排出行程」進來（replay）一定重新規劃；重新整理直接用瀏覽器存的結果、不重播（Q62）
 * - 換頁用 replace：上一頁直接回到首頁／精靈，不會回到又要重排的 /result
 * - 無解（NO_FEASIBLE、NO_SHOWTIMES）→ 放寬建議（Q23）；其他錯誤 → 白話說明＋重試
 * - 日期已經過了（舊的分享網址、舊的暫存）先不規劃，改問要換哪天（P0-1）
 * 條件同步在網址上（Q62）。
 */
export function ResultPage() {
  const state = useResultState()
  const stale = !state.pickOrigin && isPastDate(state.request.date, state.today)
  usePageTitle(state.pickOrigin ? '選出發點' : stale ? '日期已經過了' : '你的行程')
  if (state.pickOrigin) return <PickOrigin request={state.pickOrigin} />
  if (stale) return <StaleDate request={state.request} today={state.today} onFix={state.update} />
  return <SubmitView state={state} />
}

/**
 * 別人傳來「從目前位置出發」的網址（座標不寫進網址，2026-10-21 使用者決定）：
 * 其他條件照網址，出發點請使用者自己選，不自動規劃。
 */
function PickOrigin({ request }: { request: PlanRequest }) {
  const replaceRequest = usePlanStore((s) => s.replaceRequest)
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <LocateFixed className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">這個行程是從「目前位置」出發的</h1>
      <p className="mt-2 text-sm text-muted-foreground">位置只存在對方的裝置裡。選好你的出發點，其他條件照這個連結，就能排一次。</p>
      <button
        onClick={() => {
          replaceRequest(request)
          navigate('/plan/1')
        }}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
      >
        選出發點 <ArrowRight className="size-4" />
      </button>
    </div>
  )
}

function SubmitView({ state }: { state: ReturnType<typeof useResultState> }) {
  const { request, rank, update } = state
  const location = useLocation()
  const navigate = useNavigate()
  const replay = Boolean((location.state as { replay?: boolean } | null)?.replay)
  const { run, retry } = usePlanRun(request, replay)
  const key = requestKey(request)
  const reduceMotion = useReducedMotion()
  const finished = run?.status === 'done' || run?.status === 'failed'

  // 排程中就先下載結果頁的程式，排好換頁時不用再等
  useEffect(() => {
    void import('./PlanPage')
  }, [])

  // 看著跑完的那組條件，等待畫面停一下再換頁；重新整理直接拿到結果的，不用等（React「依前一次的值調整 state」寫法）
  const [watching, setWatching] = useState<string | null>(null)
  if (!finished && watching !== key) setWatching(key)
  const showProgress = !finished || watching === key
  const done = useCallback(() => setWatching(null), [])
  const cancel = () => {
    cancelPlan(request)
    navigate('/plan/4')
  }

  const jobId = run?.status === 'done' ? run.result?.job_id : undefined
  // 編號不是後端給的格式（舊版假資料存的 mock-job）：換頁只會到「找不到」，改成重新規劃
  const validId = jobId && JOB_ID_RE.test(jobId) ? jobId : undefined
  useEffect(() => {
    if (showProgress || !jobId) return
    if (!validId) {
      retry()
      return
    }
    navigate(planPath(validId, rank, location.search), { replace: true, viewTransition: !reduceMotion })
  }, [showProgress, jobId, validId, rank, location.search, navigate, reduceMotion]) // eslint-disable-line react-hooks/exhaustive-deps -- retry 每次 render 都是新函式，只在上面這些值變時才需要重跑

  // 無解的一鍵放寬會用新條件重新規劃
  const rerun = (patch: Partial<PlanRequest>) => update(patch)

  // 換頁時漏斗還要留著：三個亮點（zg-plan-1～3）要在畫面上，viewTransition 才拍得到「舊畫面」
  if (showProgress || jobId) return <PlanFunnel key={key} request={request} run={run} onDone={done} onCancel={cancel} />
  if (run?.status === 'failed') {
    if (run.error && NO_PLAN.includes(run.error.code)) return <NoSolution request={request} error={run.error} onRelax={rerun} />
    return <ResultError error={run.error} onRetry={retry} />
  }
  return <ResultError error={null} onRetry={retry} />
}
