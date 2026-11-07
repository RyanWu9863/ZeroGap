import fixture from '@/api/__fixtures__/backend-plan-result.json'
import { PlanResult } from '@/api/schemas'

/**
 * 幕後頁還沒有自己的規劃結果時用的示範：真後端跑出來的一次結果。
 * 當時送出的條件沒有保存，所以 request 是 null，不編一份；出發地從結果裡第一段搭車的起點讀。
 * 不為了範例去打後端（每個 IP 每小時只能規劃 10 次）。
 */
export function behindExample() {
  const result = PlanResult.parse(fixture)
  const firstTransit = result.plans[0]?.timeline.find((s) => s.type === 'transit')
  return {
    request: null,
    result,
    origin: firstTransit?.type === 'transit' ? firstTransit.from : null,
    sample: true as const,
  }
}
