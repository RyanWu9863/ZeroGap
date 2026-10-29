import { ArrowRight, Check, ChevronDown, LoaderCircle, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { Run } from '@/api/planRuns'
import type { PlanRequest } from '@/api/schemas'
import { useRequestLabels } from '@/api/labels'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/shared/brand/Logo'
import { gateLabels, gateRule } from '@/shared/lib/gates'
import { MOTION } from '@/shared/theme/motion'
import { planTag } from '../labels'
import { reasonLabel } from '../relax'
import { STAGES, stageIndex } from '../stages'
import { FunnelField } from './FunnelField'
import { planDots } from './funnelModel'

const NO_PLAN = ['NO_FEASIBLE', 'NO_SHOWTIMES']

type Props = { request: PlanRequest; run: Run | undefined; onDone: () => void; onCancel: () => void }

/**
 * 沉浸式新版的篩選漏斗（?exp=1，取代 PlanProgress 的畫面；Q16：不出現 AI／Jev／機率）。
 *
 * 誠實原則：畫面只跟著後端真的送來的進度走（規格書 6.4 的 SSE）。
 * - 排隊、讀資料時：點陣還沒出現，只說現在在哪一步、等了多久。
 * - 收到「全部組合數」：每個點代表固定組數，全部亮著。
 * - 收到「接得上的組數」：照真實比例熄掉被淘汰的點。後端不給每道關卡各剔除幾組，所以五道關卡一起打勾，不逐關演。
 * - 結果到了：留下的點收成方案節點；無解時列出各條件排除了幾組（NO_FEASIBLE 的 reasons）。
 */
export function FunnelRun({ request, run, onDone, onCancel }: Props) {
  const gates = gateLabels(request)
  const { station } = useRequestLabels(request)
  const [open, setOpen] = useState<number | null>(null)
  const [stay, setStay] = useState(false) // 使用者展開過關卡 → 不自動跳走，改按「看行程」
  const elapsed = useElapsed(run?.startedAt, run?.finishedAt != null)

  const finished = run?.status === 'done' || run?.status === 'failed'
  const noPlan = run?.status === 'failed' && NO_PLAN.includes(run.error?.code ?? '')
  const total = run?.combinations ?? null
  const feasible = run?.feasible ?? (noPlan && total != null ? 0 : null)
  const filtered = feasible != null
  const converged = run?.status === 'done'
  const labels = run?.result?.plans.map(planTag) ?? []
  const dots = useMemo(() => (total == null ? null : planDots(total, [filtered ? total - feasible : 0])), [total, filtered, feasible])
  const reasons = Object.entries(run?.error?.reasons ?? {}).sort(([, a], [, b]) => b - a)
  const current = finished ? (run?.status === 'failed' ? stageIndex(run.stage) : STAGES.length) : stageIndex(run?.stage ?? null)

  // 結果到了：停一下讓人看清楚收斂結果再轉場；使用者正在看關卡細節就不自動跳走；系統錯誤直接交棒
  useEffect(() => {
    if (!finished || stay) return
    const id = setTimeout(onDone, run?.status === 'failed' && !noPlan ? 0 : 1300)
    return () => clearTimeout(id)
  }, [finished, stay, noPlan, run?.status, onDone])

  const headline = !run || run.status === 'connecting'
    ? '正在送出你的條件'
    : run.status === 'queued'
      ? `排隊中，你是第 ${run.position} 位`
      : converged
        ? `從 ${feasible?.toLocaleString() ?? '—'} 種接得上的行程，挑出 ${labels.length} 個`
        : noPlan
          ? reasons.length
            ? `最常卡在「${reasonLabel(reasons[0][0], request)}」`
            : '這組條件排不出來'
          : `${STAGES[current]?.label ?? '處理中'}…`
  const shownCount = filtered ? feasible : total

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14" data-testid="funnel-run">
      <div className="flex items-center gap-3">
        <LogoMark size={36} spinning={!finished} />
        <div className="min-w-0" role="status" aria-live="polite">
          <p className="font-semibold">{headline}</p>
          <p className="text-xs text-muted-foreground">
            {finished ? '下面的點陣和數字都是後端這次送來的' : `已等 ${elapsed}・通常 2～3 分鐘，人多時要排隊`}
          </p>
        </div>
        {shownCount != null && (
          <p className="zg-num ml-auto shrink-0 whitespace-nowrap text-right">
            <span className="block text-2xl font-semibold sm:text-3xl">{shownCount.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">組{filtered ? '接得上' : '要檢查'}</span>
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_17rem]">
        <div className="zg-surface flex min-h-48 flex-col justify-center p-4 sm:p-6">
          {dots ? (
            <>
              <FunnelField plan={dots} k={filtered ? 1 : 0} converged={converged} labels={labels} failedGate={noPlan ? 0 : null} />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                1 個點 ≈ {Math.round(dots.perDot).toLocaleString()} 種組合・共 {total!.toLocaleString()} 種
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground">{finished ? '這次沒有走到篩選組合這一步。' : '還沒收到組合數，先不畫任何數字。'}</p>
          )}
          {noPlan && reasons.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs" aria-label="各條件排除的組數">
              {reasons.map(([key, n]) => (
                <li key={key} className="flex justify-between gap-2">
                  <span>{reasonLabel(key, request)}</span>
                  <span className="zg-num text-muted-foreground">排除 {n.toLocaleString()} 種</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ol className="space-y-2" aria-label="五道關卡">
          {gates.map((g, i) => {
            const judged = filtered
            const failed = judged && noPlan
            const isOpen = open === i
            return (
              <li key={g.id} className={cn('zg-surface overflow-hidden', failed && 'border-zg-fail')}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpen(isOpen ? null : i)
                    setStay(true)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm pointer-coarse:min-h-11"
                >
                  <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', judged && !failed && 'border-transparent bg-zg-ok-soft text-zg-ok', failed && 'border-transparent bg-zg-fail-soft text-zg-fail')}>
                    {judged ? (failed ? <X className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />) : run?.stage === 'filtering' && <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />}
                  </span>
                  <span className={cn('flex-1', !judged && 'text-muted-foreground')}>{g.label}</span>
                  <span className="text-[11px] text-muted-foreground">{judged ? (failed ? '沒有組合全過' : '檢查完') : '待檢查'}</span>
                  <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={MOTION.quick}>
                      <div className="space-y-1 border-t px-3 py-2.5 text-xs">
                        <p>{gateRule(g.id, request, station)}</p>
                        <p className="text-muted-foreground">五道關卡在後端一起檢查，這一版不提供每一關各淘汰幾組。</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {finished ? (
          <button onClick={onDone} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground pointer-coarse:min-h-11">
            {noPlan ? '看放寬建議' : '看行程'} <ArrowRight className="size-4" />
          </button>
        ) : (
          <>
            <span className="mr-auto text-xs text-muted-foreground">離開這一頁會取消規劃。</span>
            <button onClick={onCancel} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline pointer-coarse:min-h-11">
              取消規劃
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** 已經等了多久（每秒更新），例如 1:05 */
function useElapsed(since: number | undefined, stop: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (stop) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [stop])
  const s = Math.max(0, Math.floor((now - (since ?? now)) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
