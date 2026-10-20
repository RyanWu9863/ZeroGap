import { Check, LoaderCircle, X } from 'lucide-react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useState } from 'react'
import type { Run } from '@/api/planRuns'
import type { PlanRequest } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/shared/brand/Logo'
import { gateLabels } from '@/shared/lib/gates'
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

/**
 * 規劃中的等待畫面（取代原本約 3 秒的五道關卡動畫，Q21、Q54）。
 * 一次規劃約 2～3 分鐘、多人時還要排隊（規格書 6.7），所以照後端送來的進度一步一步打勾：
 * 排隊順位（queued）→ 各個階段（progress）→ 篩選時顯示「1,880 種組合 → 39 種接得上」。
 * 後端不提供每道關卡剔除幾組，五道關卡在篩選完成時一起打勾。
 */
export function PlanProgress({ request, run, onDone, onCancel }: Props) {
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

  // 大數字：先顯示總組合數，篩完跳到接得上的組數
  const target = run?.feasible ?? run?.combinations ?? null
  const count = useMotionValue(0)
  const shown = useTransform(count, (v) => Math.round(v).toLocaleString())
  useEffect(() => {
    if (target == null) return
    const c = animate(count, target, { duration: 0.6 })
    return () => c.stop()
  }, [target, count])

  const headline = !run || run.status === 'connecting'
    ? '正在送出條件…'
    : run.status === 'queued'
      ? `排隊中，你是第 ${run.position} 位`
      : run.status === 'done'
        ? '每一段都檢查完了'
        : failed
          ? '這組條件排不出來'
          : `${STAGES[current]?.label ?? '處理中'}…`

  return (
    <div className="mx-auto max-w-md px-4 py-12" role="status" aria-live="polite">
      <div className="flex flex-col items-center text-center">
        <LogoMark size={48} spinning={!finished} />
        <p className="mt-4 text-sm text-muted-foreground">{headline}</p>
        <p className="zg-num mt-2 text-5xl font-semibold tabular-nums">{target == null ? '—' : <motion.span>{shown}</motion.span>}</p>
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
            <li key={s.key} className={cn('zg-surface px-4 py-3', bad && 'border-zg-fail', !done && !active && !bad && 'opacity-60')}>
              <div className="flex items-center gap-3">
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border', done && 'border-transparent bg-zg-ok-soft text-zg-ok', bad && 'border-transparent bg-zg-fail-soft text-zg-fail')}>
                  {bad ? <X className="size-3.5" strokeWidth={3} /> : done ? <Check className="size-3.5" strokeWidth={3} /> : active ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
                </span>
                <span className={cn('flex-1 text-sm', !done && !active && 'text-muted-foreground')}>{s.label}</span>
              </div>
              {active && run?.waitingQuota && <p className="mt-1.5 pl-9 text-xs text-zg-tight">交通查詢每分鐘有次數限制，正在排隊等候…</p>}
              {active && run?.stage === 'llm_fallback' && <p className="mt-1.5 pl-9 text-xs text-muted-foreground">有幾個選項差不多，再確認一次</p>}
              {s.key === 'filtering' && (
                <ul className="mt-2 flex flex-wrap gap-1.5 pl-9" aria-label="五道關卡">
                  {gateLabels(request).map((g) => (
                    <li key={g.id} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', done ? 'border-transparent bg-zg-ok-soft text-zg-ok' : 'text-muted-foreground')}>
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
