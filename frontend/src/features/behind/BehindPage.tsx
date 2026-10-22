import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useRequestLabels } from '@/api/labels'
import { useLastResult } from '@/api/planRuns'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { funnelStages } from '@/shared/lib/funnel'
import { TrialRecords } from '@/features/trial/TrialRecords'
import { AgentSection } from './AgentSection'
import { FunnelCharts } from './FunnelCharts'
import { MethodSection } from './MethodSection'
import { ProbabilityTable } from './ProbabilityTable'
import { SourcesSection } from './SourcesSection'

/** 還沒有自己的結果時的範例：假資料的基準案例（不為了範例去打後端：每個 IP 每小時只能規劃 10 次） */
const EXAMPLE = { request: benchmarkRequest, result: mockResult(benchmarkRequest, false) }

/**
 * 系統幕後（Q15b、Q65）：給評審看深度的地方。由上往下「先講道理、再看證據」：
 * ① 方法＋架構 ② 本次查詢的漏斗＋機率 ③ 資料來源（A9）＋展示模式 ④ Agent 接口＋原始 JSON。
 * 用瀏覽器裡最近一次成功的規劃；還沒排過行程時，用假資料的基準案例當範例（Q66），並標「範例」。
 */
export function BehindPage() {
  const last = useLastResult()
  const isExample = !last
  const { request, result } = last ?? EXAMPLE
  const labels = useRequestLabels(request)

  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 pt-10 sm:px-6">
      <MethodSection />

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">THIS QUERY</p>
            <h2 className="mt-2 text-2xl font-bold cine:font-semibold lin:font-semibold">
              {isExample ? '範例：中壢站出發、桃園區（假資料）' : `本次查詢：${labels.station} → ${labels.area}`}
            </h2>
          </div>
          {isExample && (
            <Link to="/plan/1" className="inline-flex items-center gap-1 text-sm underline underline-offset-4">
              用你的條件試試 <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="zg-surface min-w-0 p-5">
            <h3 className="font-semibold">從全部組合到 {result.plans.length} 個方案</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              {result.stats.combinations.toLocaleString()} 種組合，{result.stats.feasible.toLocaleString()} 種每段都接得上。後端不提供每道關卡各剔除幾組。
            </p>
            <FunnelCharts total={result.stats.combinations} stages={funnelStages(result)} />
          </div>
          <div className="zg-surface min-w-0 p-5">
            <h3 className="mb-4 font-semibold">Jev 怎麼排序</h3>
            <ProbabilityTable data={result} />
          </div>
        </div>
      </section>

      <section>
        <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">DATA & STATUS</p>
        <h2 className="mb-6 mt-2 text-2xl font-bold cine:font-semibold lin:font-semibold">資料從哪裡來、現在新不新</h2>
        <SourcesSection />
      </section>

      <TrialRecords />

      <section>
        <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">FOR AGENTS</p>
        <h2 className="mb-6 mt-2 text-2xl font-bold cine:font-semibold lin:font-semibold">同一份合約，人和 Agent 都能用</h2>
        <AgentSection request={request} data={result} />
      </section>
    </div>
  )
}
