import { lazy, Suspense, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useRequestLabels } from '@/api/labels'
import { useLastResult } from '@/api/planRuns'
import { usePageTitle } from '@/shared/lib/usePageTitle'
import { funnelStages } from '@/shared/lib/funnel'
import { AgentSection } from './AgentSection'
import { behindExample } from './behindExample'
import { McpSection } from './McpSection'
import { MethodSection } from './MethodSection'
import { ProbabilityTable } from './ProbabilityTable'
import { SourcesSection } from './SourcesSection'

// Recharts 很大，只在幕後頁用，而且等頁面出來才載入
const FunnelCharts = lazy(() => import('./FunnelCharts').then((m) => ({ default: m.FunnelCharts })))

/** 圖表還沒載入時的文字版：三個數字 */
function FunnelText({ combinations, feasible, shown }: { combinations: number; feasible: number; shown: number }) {
  return (
    <ul className="space-y-1 text-sm">
      <li>全部組合：<span className="zg-num">{combinations.toLocaleString()}</span></li>
      <li>每段都接得上：<span className="zg-num">{feasible.toLocaleString()}</span></li>
      <li>給你的方案：<span className="zg-num">{shown.toLocaleString()}</span></li>
    </ul>
  )
}

/**
 * 系統幕後（Q15b、Q65）：台上簡報用的頁面，不放在導覽列。永遠是夜主題（只有這一塊，不動使用者的外觀）。
 * 由上往下：① 方法＋架構 ② 這次的漏斗 ③ 決策表 ④ MCP ⑤ 資料狀態＋展示模式 ⑥ 原始 JSON。
 * 用這台瀏覽器最近一次成功的規劃；沒有就用示範範例（真後端結果、沒有當時的條件），並標「示範」。
 */
export function BehindPage() {
  usePageTitle('系統幕後')
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
  const last = useLastResult()
  const example = last ? null : behindExample()
  const request = last?.request ?? null
  const result = last?.result ?? behindExample().result
  const labels = useRequestLabels(request)
  const { combinations, feasible } = result.stats

  return (
    <div data-theme="night" className="dark min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-16 px-4 pb-16 pt-10 sm:px-6">
        <h1 className="sr-only">系統幕後</h1>
        <MethodSection />

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">THIS QUERY</p>
              <h2 className="mt-2 text-2xl font-bold">
                {example
                  ? `示範：一次真的規劃結果${example.origin ? `（從${example.origin}出發）` : ''}`
                  : `本次查詢：${labels.station} → ${labels.area}`}
              </h2>
            </div>
            {example && (
              <Link to="/plan/1" className="inline-flex items-center gap-1 text-sm underline underline-offset-4">
                用你的條件試試 <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="zg-surface min-w-0 p-5">
              <h3 className="font-semibold">從全部組合到 {result.plans.length} 個方案</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                {combinations.toLocaleString()} 種組合，{feasible.toLocaleString()} 種每段都接得上。成功時不提供每道關卡各剔除幾組。
              </p>
              <Suspense fallback={<FunnelText combinations={combinations} feasible={feasible} shown={result.plans.length} />}>
                <FunnelCharts total={combinations} stages={funnelStages(result)} />
              </Suspense>
            </div>
            <div className="zg-surface min-w-0 p-5">
              <h3 className="mb-4 font-semibold">Jev 怎麼排序</h3>
              <ProbabilityTable data={result} />
            </div>
          </div>
        </section>

        <McpSection />

        <section>
          <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">DATA & STATUS</p>
          <h2 className="mb-6 mt-2 text-2xl font-bold">資料從哪裡來、現在新不新</h2>
          <SourcesSection />
        </section>

        <section>
          <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">RAW</p>
          <h2 className="mb-6 mt-2 text-2xl font-bold">原始 JSON</h2>
          <AgentSection request={request} data={result} />
        </section>
      </div>
    </div>
  )
}
