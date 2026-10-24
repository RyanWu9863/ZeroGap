import { ArrowRight, Check, ChevronDown, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { ItineraryRequest, ItineraryResponse } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/shared/brand/Logo'
import { gateLabels, gateRule } from '@/shared/lib/gates'
import { MOTION } from '@/shared/theme/motion'
import { planTag } from '../labels'
import { FunnelField } from './FunnelField'
import { planDots } from './funnelModel'

const TOTAL_MS = { full: 3200, short: 1000 }

type Props = { request: ItineraryRequest; data: ItineraryResponse | undefined; mode: 'full' | 'short'; onDone: () => void }

/**
 * 沉浸式新版的篩選漏斗（?exp=1，取代 FilterRun 的畫面；Q16：不出現 AI／Jev／機率）。
 *
 * 誠實原則：排程服務是「一次送出、一次回傳」，中途沒有進度。
 * - 等待時：只說「已送出、等回應」和真的等了幾秒，關卡標「待檢查」，不假裝正在逐關檢查。
 * - 回應到了：用回應裡真實的每關剔除數，逐關「重播」這次的結果，並且寫明是重播。
 * - 每道關卡可以展開看規則和剔除數；個別被淘汰的組合後端沒給（API 提案 #10），所以不顯示。
 */
export function FunnelRun({ request, data, mode, onDone }: Props) {
  const gates = gateLabels(request)
  const [started] = useState(() => performance.now())
  const [waited, setWaited] = useState(0)
  const [k, setK] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const [stay, setStay] = useState(false) // 使用者展開過關卡 → 不自動跳走，改按「看行程」
  const blocking = data?.no_solution?.blocking_filter.id ?? null
  const stopAt = blocking ?? 5
  const done = Boolean(data) && k >= stopAt
  const converged = done && blocking == null
  const total = data?.funnel_stats.total_checked
  const eliminated = data?.funnel_stats.by_filter?.map((f) => f.eliminated)
  const dots = useMemo(() => (total == null ? null : planDots(total, eliminated)), [total, eliminated])
  const labels = data?.top_3_proposals.map(planTag) ?? []

  // 等待中：真的等了幾秒（每秒更新一次）
  useEffect(() => {
    if (data) return
    const id = setInterval(() => setWaited(Math.floor((performance.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [data, started])

  // 回應到了才逐關重播；剩下的時間平均分給每一關
  useEffect(() => {
    if (!data || k >= stopAt) return
    const left = Math.max(TOTAL_MS[mode] - (performance.now() - started), 0)
    const id = setTimeout(() => setK((x) => x + 1), Math.max(left / (stopAt - k), mode === 'full' ? 420 : 140))
    return () => clearTimeout(id)
  }, [data, k, stopAt, mode, started])

  // 重播完：停一下讓人看清楚收斂結果再轉場；使用者正在看關卡細節就不自動跳走
  useEffect(() => {
    if (!done || stay) return
    const id = setTimeout(onDone, mode === 'full' ? 1300 : 350)
    return () => clearTimeout(id)
  }, [done, stay, mode, onDone])

  const remaining = (i: number) => (total == null || !eliminated ? null : total - eliminated.slice(0, i).reduce((a, b) => a + b, 0))
  const shownCount = !data ? null : converged ? data.funnel_stats.feasible_count : remaining(k)
  const headline = !data
    ? '已送出你的條件，正在等排程服務回應'
    : blocking && done
      ? `卡在「${gates[blocking - 1].label}」這一關`
      : converged
        ? `從 ${data.funnel_stats.feasible_count} 種接得上的行程，挑出 ${labels.length} 個`
        : `重播第 ${Math.min(k + 1, 5)} 關：${gates[Math.min(k, 4)].label}`

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14" data-testid="funnel-run">
      <div className="flex items-center gap-3">
        <LogoMark size={36} spinning={!done} />
        <div className="min-w-0" role="status" aria-live="polite">
          <p className="font-semibold">{headline}</p>
          <p className="text-xs text-muted-foreground">
            {!data ? `已等 ${waited} 秒・回應到了會逐關說明結果` : '排程服務一次回傳整份結果，下面是這次結果的逐關重播'}
          </p>
        </div>
        {shownCount != null && (
          <p className="zg-num ml-auto shrink-0 whitespace-nowrap text-right">
            <span className="block text-2xl font-semibold sm:text-3xl">{shownCount.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">組{converged ? '接得上' : '還留著'}</span>
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_17rem]">
        <div className="zg-surface flex min-h-48 flex-col justify-center p-4 sm:p-6">
          {dots ? (
            <>
              <FunnelField plan={dots} k={Math.min(k, 5)} converged={converged} labels={labels} failedGate={blocking ? blocking - 1 : null} />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                1 個點 ≈ {Math.round(dots.perDot)} 種組合・共 {total!.toLocaleString()} 種
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              {!data ? '還沒收到回應，先不畫任何數字。' : '這次的結果沒有附上每一關剔除了幾組，只顯示最後接得上的組數。'}
            </p>
          )}
        </div>

        <ol className="space-y-2" aria-label="五道關卡">
          {gates.map((g, i) => {
            const judged = Boolean(data) && i < k
            const failed = judged && blocking === g.id
            const skipped = blocking != null && g.id > blocking
            const isOpen = open === i
            return (
              <li key={g.id} className={cn('zg-surface overflow-hidden', failed && 'border-zg-fail', skipped && 'opacity-40')}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => { setOpen(isOpen ? null : i); setStay(true) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm pointer-coarse:min-h-11"
                >
                  <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', judged && !failed && 'border-transparent bg-zg-ok-soft text-zg-ok', failed && 'border-transparent bg-zg-fail-soft text-zg-fail')}>
                    {judged && (failed ? <X className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />)}
                  </span>
                  <span className={cn('flex-1', !judged && 'text-muted-foreground')}>{g.label}</span>
                  <span className="text-[11px] text-muted-foreground">{judged ? (failed ? '過不去' : '通過') : skipped ? '沒檢查' : '待檢查'}</span>
                  <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={MOTION.quick}>
                      <div className="space-y-1 border-t px-3 py-2.5 text-xs">
                        <p>{gateRule(g.id, request)}</p>
                        {judged && eliminated ? (
                          <p className="zg-num text-muted-foreground">
                            淘汰 {eliminated[i].toLocaleString()} 種・還剩 {remaining(i + 1)!.toLocaleString()} 種
                          </p>
                        ) : (
                          <p className="text-muted-foreground">{judged ? '這次的結果沒有附上這一關的剔除數。' : '還沒輪到這一關。'}</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="mt-6 flex justify-end">
        {done && stay ? (
          <button onClick={onDone} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground pointer-coarse:min-h-11">
            {blocking ? '看放寬建議' : '看行程'} <ArrowRight className="size-4" />
          </button>
        ) : (
          data && (
            <button onClick={onDone} className="text-xs text-muted-foreground underline-offset-2 hover:underline pointer-coarse:min-h-11">
              略過動畫
            </button>
          )
        )}
      </div>
    </div>
  )
}
