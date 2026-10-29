import { Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PlanRequest, PlanResult } from '@/api/schemas'
import { FunnelField } from '@/features/result/funnel/FunnelField'
import { planDots } from '@/features/result/funnel/funnelModel'
import { planTag } from '@/features/result/labels'
import { funnelStages } from '@/shared/lib/funnel'
import { gateLabels, gateRule } from '@/shared/lib/gates'
import { FunnelCharts } from '../FunnelCharts'

/**
 * 版本 A：篩選漏斗。全部組合 → 每段都接得上 → 給你的方案，可以一層一層點著看，或按「重播」從頭跑一次。
 * 數字全來自後端結果的 stats（規格書 6.5）。後端不給每道關卡各剔除幾組，所以五道關卡算同一層，不逐關拆。
 */
export function FunnelView({ request, result, origin }: { request: PlanRequest; result: PlanResult; origin: string }) {
  const { combinations: total, feasible } = result.stats
  const stages = funnelStages(result)
  const dots = useMemo(() => planDots(total, [total - feasible]), [total, feasible])
  const [k, setK] = useState(2)
  const [playing, setPlaying] = useState(false)

  // 重播：一層一層往下走，走到最後一層自然停（不另外改狀態）
  const running = playing && k < 2
  useEffect(() => {
    if (!running) return
    const id = setTimeout(() => setK((x) => x + 1), 900)
    return () => clearTimeout(id)
  }, [running, k])

  if (!dots) return <p className="text-sm text-muted-foreground">這次的結果沒有組合數，畫不出漏斗。</p>

  const levels = [
    { label: '全部組合', count: total, note: '這天、這個商圈的電影場次 × 餐廳' },
    { label: stages[0].label, count: stages[0].remaining, note: `濾網：${stages[0].tech}・淘汰 ${stages[0].eliminated.toLocaleString()} 種` },
    { label: stages[1].label, count: stages[1].remaining, note: `${stages[1].tech}・從接得上的組合挑出 ${stages[1].remaining} 個` },
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between">
          <p className="zg-num text-3xl font-semibold" data-testid="funnel-count" aria-live="polite">
            {levels[k].count.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-muted-foreground">{k === 0 ? '組（全部）' : k === 1 ? '組接得上' : '個方案'}</span>
          </p>
          <button onClick={() => { setK(0); setPlaying(true) }} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs hover:bg-muted pointer-coarse:min-h-10">
            <Play className="size-3" aria-hidden="true" /> 重播
          </button>
        </div>
        <div className="mx-auto mt-4 max-w-md">
          <FunnelField plan={dots} k={Math.min(k, 1)} converged={k === 2} labels={result.plans.map(planTag)} />
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">1 個點 ≈ {Math.round(dots.perDot).toLocaleString()} 種組合</p>
        <details className="mt-4 rounded-lg border p-3">
          <summary className="cursor-pointer text-sm">看圖表（長條圖／桑基圖）</summary>
          <div className="mt-3"><FunnelCharts total={total} stages={stages} /></div>
        </details>
      </div>
      <div className="space-y-3">
        <ol className="space-y-1.5" aria-label="一層一層看">
          {levels.map((l, i) => (
            <li key={l.label}>
              <button
                aria-pressed={k === i}
                onClick={() => { setPlaying(false); setK(i) }}
                className="w-full rounded-lg border px-3 py-2 text-left text-sm aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary"
              >
                <span className="flex justify-between gap-2">
                  <span>{l.label}</span>
                  <span className="zg-num">{l.count.toLocaleString()}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{l.note}</span>
              </button>
            </li>
          ))}
        </ol>
        <details className="rounded-lg border p-3 text-xs">
          <summary className="cursor-pointer text-sm">五道關卡各檢查什麼</summary>
          <ul className="mt-2 space-y-1.5">
            {gateLabels(request).map((g) => (
              <li key={g.id}>
                <span className="font-medium">{g.id}. {g.label}</span>
                <span className="block text-muted-foreground">{gateRule(g.id, request, origin)}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  )
}
