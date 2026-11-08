import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { HowItWasMade } from './HowItWasMade'

const result = mockResult(benchmarkRequest, true)
const html = (rank: number) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <HowItWasMade plan={result.plans.find((p) => p.rank === rank)!} stats={result.stats} plansCount={result.plans.length} date={benchmarkRequest.date} />
    </QueryClientProvider>,
  )

describe('這個方案怎麼來的', () => {
  it('用這次的真數字：全部組合 → 接得上 → 給你幾個', () => {
    const h = html(1)
    expect(h).toContain(result.stats.combinations.toLocaleString())
    expect(h).toContain(result.stats.feasible.toLocaleString())
    expect(h).toContain(`挑出 ${result.plans.length} 個`)
  })
  it('有備選就列出來（拿不定的情境第 1 案有電影和餐廳備選）', () => {
    const p1 = result.plans.find((p) => p.rank === 1)!
    const h = html(1)
    p1.alternatives.movie?.forEach((a) => expect(h).toContain(a.title))
  })
  // 只比對畫面上的字（標籤名稱 details 裡剛好有 ai）
  it('不出現 AI、Jev、LLM、機率', () => {
    for (const rank of result.plans.map((p) => p.rank)) expect(html(rank).replace(/<[^>]*>/g, '')).not.toMatch(/AI|Jev|LLM|機率/i)
  })
})
