import { Check, LoaderCircle, X } from 'lucide-react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useState } from 'react'
import type { ItineraryRequest, ItineraryResponse } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { gateLabels, remainingAfter } from '@/shared/lib/gates'
import { LogoMark } from '@/shared/brand/Logo'

type Props = {
  request: ItineraryRequest
  data: ItineraryResponse | undefined
  /** full：第一次排行程約 3 秒；short：改條件重算約 1 秒（Q54） */
  mode: 'full' | 'short'
  onDone: () => void
}

const TOTAL_MS = { full: 3000, short: 900 }

/**
 * 五道關卡篩選動畫（Q21、Q54）。
 * 後端還沒回來：關卡顯示「檢查中」；回來後依序打勾，數字從全部組合往下跳。
 * 無解時停在卡住的那一關打 ✗（Q23）。右下角可以略過。
 */
export function FilterRun({ request, data, mode, onDone }: Props) {
  const gates = gateLabels(request)
  const [started] = useState(() => performance.now())
  const [k, setK] = useState(0) // 已經判定完的關卡數
  const blocking = data?.no_solution?.blocking_filter.id ?? null
  const stopAt = blocking ?? 5

  // 資料到了才開始打勾；把剩下的時間平均分給每一關，總長大約固定
  useEffect(() => {
    if (!data || k >= stopAt) return
    const left = Math.max(TOTAL_MS[mode] - (performance.now() - started), 0)
    const id = setTimeout(() => setK((x) => x + 1), Math.max(left / (stopAt - k), mode === 'full' ? 260 : 120))
    return () => clearTimeout(id)
  }, [data, k, stopAt, mode, started])

  // 全部判定完，停一下讓人看清楚結果，再交棒給結果頁
  useEffect(() => {
    if (!data || k < stopAt) return
    const id = setTimeout(onDone, mode === 'full' ? 700 : 250)
    return () => clearTimeout(id)
  }, [data, k, stopAt, mode, onDone])

  // 數字往下跳
  const total = data?.funnel_stats.total_checked
  const eliminated = data?.funnel_stats.by_filter?.map((f) => f.eliminated)
  const target = total == null ? null : k >= 5 ? data!.funnel_stats.feasible_count : (remainingAfter(total, eliminated, k) ?? total)
  const count = useMotionValue(0)
  const shown = useTransform(count, (v) => Math.round(v).toLocaleString())
  useEffect(() => {
    if (target == null) return
    const c = animate(count, target, { duration: mode === 'full' ? 0.45 : 0.2 })
    return () => c.stop()
  }, [target, count, mode])

  return (
    <div className="mx-auto max-w-md px-4 py-16" role="status" aria-live="polite">
      <div className="flex flex-col items-center text-center">
        <LogoMark size={48} spinning={k < stopAt} />
        <p className="mt-4 text-sm text-muted-foreground">
          {!data ? '正在找出所有可能的組合…' : blocking && k >= stopAt ? '有一關過不去' : k >= 5 ? '每一段都檢查完了' : '一關一關檢查中…'}
        </p>
        <p className="zg-num mt-2 text-5xl font-semibold tabular-nums">
          {target == null ? '—' : <motion.span>{shown}</motion.span>}
        </p>
        <p className="text-xs text-muted-foreground">{blocking && k >= stopAt ? '組通過了前面的關卡' : k >= 5 ? '組每段都接得上' : '組還在檢查'}</p>
      </div>

      <ol className="mt-8 space-y-2">
        {gates.map((g, i) => {
          const judged = i < k
          const failed = judged && blocking === g.id
          const waiting = !judged && (i === k && k < stopAt)
          const skipped = blocking != null && g.id > blocking
          return (
            <motion.li
              key={g.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: skipped ? 0.35 : 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn('zg-surface flex items-center gap-3 px-4 py-3', failed && 'border-zg-fail')}
            >
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full border',
                  judged && !failed && 'border-transparent bg-zg-ok-soft text-zg-ok',
                  failed && 'border-transparent bg-zg-fail-soft text-zg-fail',
                )}
              >
                {judged ? (failed ? <X className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />) : waiting ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}
              </span>
              <span className={cn('flex-1 text-sm', !judged && 'text-muted-foreground')}>{g.label}</span>
              {judged && eliminated && (
                <span className="zg-num text-xs text-muted-foreground">−{eliminated[i].toLocaleString()} 組</span>
              )}
            </motion.li>
          )
        })}
      </ol>

      {data && k < stopAt && (
        <div className="mt-6 flex justify-end">
          <button onClick={onDone} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            略過動畫
          </button>
        </div>
      )}
    </div>
  )
}
