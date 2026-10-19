import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useItineraries } from '@/api/queries'
import { benchmarkRequest } from '@/mocks/request'
import { funnelStages } from '@/shared/lib/funnel'
import { LogoMark } from '@/shared/brand/Logo'
import { usePlanStore } from '@/store/planStore'
import { AgentSection } from './AgentSection'
import { FunnelCharts } from './FunnelCharts'
import { MethodSection } from './MethodSection'
import { ProbabilityTable } from './ProbabilityTable'
import { SourcesSection } from './SourcesSection'

/**
 * 系統幕後（Q15b、Q65）：給評審看深度的地方。由上往下「先講道理、再看證據」：
 * ① 方法＋架構 ② 本次查詢的漏斗＋機率 ③ 資料來源（A9）＋展示模式 ④ Agent 接口＋原始 JSON。
 * 還沒排過行程時，用基準案例當範例（Q66）。
 */
export function BehindPage() {
  const { request: mine, animatedKey } = usePlanStore()
  const isExample = animatedKey === null
  const request = isExample ? benchmarkRequest : mine
  const { data } = useItineraries(request)
  const stages = data ? funnelStages(request, data) : null

  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 pt-10 sm:px-6">
      <MethodSection />

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">THIS QUERY</p>
            <h2 className="mt-2 text-2xl font-bold cine:font-semibold lin:font-semibold">
              {isExample ? '範例：中壢站出發、桃園區' : `本次查詢：${request.origin_station} → ${request.district_hub}`}
            </h2>
          </div>
          {isExample && (
            <Link to="/plan/1" className="inline-flex items-center gap-1 text-sm underline underline-offset-4">
              用你的條件試試 <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
        {!data ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><LogoMark size={40} spinning /></div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="zg-surface p-5">
              <h3 className="font-semibold">五道關卡漏斗</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                {data.funnel_stats.total_checked.toLocaleString()} 種組合，最後 {data.funnel_stats.feasible_count} 種每段都接得上。
              </p>
              {stages ? (
                <FunnelCharts total={data.funnel_stats.total_checked} stages={stages} />
              ) : (
                <p className="text-sm text-muted-foreground">後端還沒回傳每一關的剔除數（API 變更提案 #7）。</p>
              )}
            </div>
            <div className="zg-surface p-5">
              <h3 className="mb-4 font-semibold">Jev 怎麼排序</h3>
              <ProbabilityTable data={data} />
            </div>
          </div>
        )}
      </section>

      <section>
        <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">DATA & STATUS</p>
        <h2 className="mb-6 mt-2 text-2xl font-bold cine:font-semibold lin:font-semibold">資料從哪裡來、現在新不新</h2>
        <SourcesSection />
      </section>

      {data && (
        <section>
          <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">FOR AGENTS</p>
          <h2 className="mb-6 mt-2 text-2xl font-bold cine:font-semibold lin:font-semibold">同一份合約，人和 Agent 都能用</h2>
          <AgentSection request={request} data={data} />
        </section>
      )}
    </div>
  )
}
