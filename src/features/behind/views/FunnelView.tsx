import { Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ItineraryRequest, ItineraryResponse } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { FunnelField } from '@/features/result/funnel/FunnelField'
import { planDots } from '@/features/result/funnel/funnelModel'
import { planTag } from '@/features/result/labels'
import { funnelStages } from '@/shared/lib/funnel'
import { gateRule } from '@/shared/lib/gates'
import { FunnelCharts } from '../FunnelCharts'

/**
 * 版本 A：篩選漏斗。同一份回應裡的每關剔除數，可以一關一關點著看，或按「重播」從頭跑一次。
 * 數字全來自後端的 funnel_stats（提案 #7）；沒有就說明沒有，不畫點陣。
 */
export function FunnelView({ request, data }: { request: ItineraryRequest; data: ItineraryResponse }) {
  const f = data.funnel_stats
  const stages = funnelStages(request, data)
  const eliminated = f.by_filter?.map((x) => x.eliminated)
  const dots = useMemo(() => planDots(f.total_checked, eliminated), [f.total_checked, eliminated])
  const blocking = data.no_solution?.blocking_filter.id ?? null
  const last = blocking ?? 5
  const [k, setK] = useState(last)
  const [playing, setPlaying] = useState(false)

  // 重播：一關一關往下走，走到最後一關自然停（不另外改狀態）
  const running = playing && k < last
  useEffect(() => {
    if (!running) return
    const id = setTimeout(() => setK((x) => x + 1), 650)
    return () => clearTimeout(id)
  }, [running, k])

  if (!stages || !dots) return <p className="text-sm text-muted-foreground">這次的回應沒有附上每一關剔除了幾組（API 提案 #7），只知道 {f.total_checked.toLocaleString()} 種組合裡有 {f.feasible_count} 種接得上。</p>

  const converged = k >= 5 && blocking == null
  const shown = k === 0 ? f.total_checked : stages[k - 1].remaining
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between">
          <p className="zg-num text-3xl font-semibold" data-testid="funnel-count" aria-live="polite">{shown.toLocaleString()}<span className="ml-1 text-sm font-normal text-muted-foreground">組{k === 0 ? '（全部）' : converged ? '接得上' : '還留著'}</span></p>
          <button onClick={() => { setK(0); setPlaying(true) }} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs hover:bg-muted pointer-coarse:min-h-10">
            <Play className="size-3" aria-hidden="true" /> 重播
          </button>
        </div>
        <div className="mx-auto mt-4 max-w-md">
          <FunnelField plan={dots} k={k} converged={converged} labels={data.top_3_proposals.map(planTag)} failedGate={blocking && k >= blocking ? blocking - 1 : null} />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">1 個點 ≈ {Math.round(dots.perDot)} 種組合</p>
        <details className="mt-4 rounded-lg border p-3">
          <summary className="cursor-pointer text-sm">看圖表（長條圖／桑基圖）</summary>
          <div className="mt-3"><FunnelCharts total={f.total_checked} stages={stages} /></div>
        </details>
      </div>
      <ol className="space-y-1.5" aria-label="一關一關看">
        <li>
          <button aria-pressed={k === 0} onClick={() => { setPlaying(false); setK(0) }} className="w-full rounded-lg border px-3 py-2 text-left text-sm aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary">
            全部組合 <span className="zg-num float-right">{f.total_checked.toLocaleString()}</span>
          </button>
        </li>
        {stages.map((s, i) => (
          <li key={s.tech}>
            <button
              aria-pressed={k === i + 1}
              disabled={blocking != null && i + 1 > blocking}
              onClick={() => { setPlaying(false); setK(i + 1) }}
              className={cn('w-full rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-40 aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary', blocking === i + 1 && 'border-zg-fail')}
            >
              <span className="flex justify-between gap-2">
                <span>{i + 1}. {s.label}</span>
                <span className="zg-num text-zg-fail">−{s.eliminated.toLocaleString()}</span>
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">濾網：{s.tech}・{gateRule(i + 1, request)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
