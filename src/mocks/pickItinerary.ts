import type { ItineraryRequest, ItineraryResponse, Proposal } from '@/api/schemas'
import { itineraryOk } from './itineraryOk'
import { itineraryBudget, itineraryWeekend } from './itineraryScenarios'

const CANDIDATES = [itineraryOk, itineraryWeekend, itineraryBudget]

/** 這個方案的吃飯順序：時間軸上電影在用餐前面＝看完再吃 */
function diningOrder(p: Proposal): ItineraryRequest['dining_order'] {
  const types = p.timeline_steps.map((s) => s.type)
  return types.indexOf('電影') < types.indexOf('晚餐') ? '看完電影再吃' : '先吃再看'
}

/** 三個方案都符合條件：吃飯順序一樣、在時段內出發和回到站、不超過預算 */
export function fitsRequest(data: ItineraryResponse, req: ItineraryRequest): boolean {
  return data.top_3_proposals.every(
    (p) =>
      diningOrder(p) === req.dining_order &&
      p.summary.departure_time >= req.earliest_departure &&
      p.summary.return_time <= req.latest_return &&
      p.summary.total_cost_per_person <= req.budget_per_person,
  )
}

/**
 * 假資料模式：挑第一組「三個方案都符合條件」的假行程，讓情境卡和簡報的條件跟結果對得上。
 * 都不符合時（例如自己改成很短的時段）退回基準那組；假資料只有這三組，不在前端另外算時間。
 */
export function pickItinerary(req: ItineraryRequest): ItineraryResponse {
  return CANDIDATES.find((c) => fitsRequest(c, req)) ?? itineraryOk
}
