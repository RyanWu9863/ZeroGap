import { Check, LoaderCircle, X } from 'lucide-react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useState } from 'react'
import type { Run } from '@/api/planRuns'
import type { PlanRequest } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/shared/brand/Logo'
import { gateLabels } from '@/shared/lib/gates'
import { funnelHeadline } from './funnelCopy'
import { STAGES, stageIndex } from './stages'

type Props = { request: PlanRequest; run: Run | undefined; onDone: () => void; onCancel: () => void }

/** 已經等了多久（每秒更新） */
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

/** 大數字：用跳的過去；減少動態時直接顯示 */
function BigCount({ target }: { target: number | null }) {
  const reduce = useReducedMotion()
  const count = useMotionValue(0)
  const shown = useTransform(count, (v) => Math.round(v).toLocaleString())
  useEffect(() => {
    if (target == null) return
    if (reduce) {
      count.set(target)
      return
    }
    const c = animate(count, target, { duration: 0.6 })
    return () => c.stop()
  }, [target, count, reduce])
  return <p className="zg-num mt-2 text-5xl font-semibold tabular-nums">{target == null ? '—' : <motion.span>{shown}</motion.span>}</p>
}

/**
 * 規劃中的等待畫面：往下收窄的 7 階段漏斗，照後端送來的真進度一步一步亮（規格 4.1～4.3）。
 * 一次規劃約 2～3 分鐘、多人時還要排隊（規格書 6.7）。
 * 後端不提供每道關卡剔除幾組，五道關卡在篩選完成時一起打勾。
 * 跑完後三個亮點帶 view-transition-name（zg-plan-1～3），換到 /p/編號時飛進三張方案卡。
 * 只有最上面那一行在 aria-live，數字和清單不念。
 */
export function PlanFunnel({ request, run, onDone, onCancel }: Props) {
  const finished = run?.status === 'done' || run?.status === 'failed'
  const failed = run?.status === 'failed'
  const current = finished ? (failed ? stageIndex(run?.stage ?? null) : STAGES.length) : stageIndex(run?.stage ?? null)
  const elapsed = useElapsed(run?.startedAt, finished)

  // 結果到了：停一下讓人看清楚，再交棒給結果頁或無解畫面
  useEffect(() => {
    if (!finished) return
    const id = setTimeout(onDone, failed && !['NO_FEASIBLE', 'NO_SHOWTIMES'].includes(run?.error?.code ?? '') ? 0 : 800)
    return () => clearTimeout(id)
  }, [finished, failed, run?.error?.code, onDone])

  const target = run?.feasible ?? run?.combinations ?? null
  const plans = run?.status === 'done' ? (run.result?.plans ?? []) : []

  // min-h-dvh：等待畫面至少一個視窗高，整頁一定比視窗長。整頁塞得進視窗時（例如 iPad 直放 810×1080），
  // 換到 /p/編號的 viewTransition 會讓 WebKit 的頁面當掉（Playwright 的 WebKit 實測，桌機 1280×1080 也一樣）
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 py-12">
      <div className="flex flex-col items-center text-center">
        <LogoMark size={48} spinning={!finished} />
        <p role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {funnelHeadline(run)}
        </p>
        <BigCount target={target} />
        <p className="text-xs text-muted-foreground">
          {run?.feasible != null ? `種每段都接得上（共 ${run.combinations?.toLocaleString() ?? '—'} 種組合）` : run?.combinations != null ? '種組合檢查中' : '種組合'}
        </p>
      </div>

      <ol className="mt-8 space-y-2" aria-label="規劃進度">
        {STAGES.map((s, i) => {
          const done = i < current
          const active = i === current && !finished
          const bad = failed && i === current
          return (
            <li
              key={s.key}
              style={{ width: `calc(100% - ${i * 5}%)` }}
              className={cn('zg-surface mx-auto min-w-[16rem] px-4 py-3', done && 'bg-[var(--zg-glow)]', active && 'border-[var(--zg-flow)]', bad && 'border-zg-fail')}
            >
              <div className="flex items-center gap-3">
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border', done && 'border-transparent text-[var(--zg-flow)]', bad && 'border-transparent bg-zg-fail-soft text-zg-fail')}>
                  {bad ? <X className="size-3.5" strokeWidth={3} /> : done ? <Check className="size-3.5" strokeWidth={3} /> : active ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
                </span>
                <span className={cn('flex-1 text-sm', !done && !active && 'text-muted-foreground')}>{s.label}</span>
              </div>
              {active && run?.waitingQuota && <p className="mt-1 pl-9 text-xs text-muted-foreground">交通查詢有次數限制，需要稍等</p>}
              {s.key === 'filtering' && (
                <ul className="mt-2 flex flex-wrap gap-1.5 pl-9" aria-label="五道關卡">
                  {gateLabels(request).map((g) => (
                    <li key={g.id} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', done ? 'border-transparent bg-[var(--zg-glow)] text-[var(--zg-flow)]' : 'text-muted-foreground')}>
                      {done && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
                      {g.label}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      {plans.length > 0 && (
        <div className="mt-6 flex items-center justify-center gap-6">
          {plans.map((p) => (
            <span
              key={p.rank}
              aria-hidden="true"
              style={{ viewTransitionName: `zg-plan-${p.rank}` }}
              className="size-3 rounded-full bg-[var(--zg-flow)] shadow-[0_0_12px_var(--zg-glow)]"
            />
          ))}
          <span className="sr-only">找到 {plans.length} 個方案</span>
        </div>
      )}

      {!finished && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="zg-num">已等 {elapsed}・通常 2～3 分鐘，人多時要排隊</span>
          <button onClick={onCancel} className="underline-offset-2 hover:text-foreground hover:underline pointer-coarse:py-2">
            取消規劃
          </button>
        </div>
      )}
      {!finished && <p className="mt-2 text-xs text-muted-foreground">離開這一頁會取消規劃。</p>}
    </div>
  )
}
