import type { ItineraryResponse } from '@/api/schemas'
import { itineraryOk } from './itineraryOk'

/** 開發用假資料：無解（照 docs/API.md §6.6），卡在第 5 關「預算」 */
export const itineraryNoSolution: ItineraryResponse = {
  result_status: 'no_solution',
  system_status: itineraryOk.system_status,
  funnel_stats: {
    total_checked: 1880,
    feasible_count: 0,
    returned_count: 0,
    by_filter: [
      { id: 1, name: '時空連貫', eliminated: 820 },
      { id: 2, name: '餐飲營業', eliminated: 610 },
      { id: 3, name: '步行距離', eliminated: 260 },
      { id: 4, name: '末班車', eliminated: 101 },
      { id: 5, name: '預算', eliminated: 89 },
    ],
  },
  confidence_gate: { threshold: 0.6, passed: false, uncertain_field: null },
  top_3_proposals: [],
  alternatives: [],
  no_solution: {
    blocking_filter: { id: 5, name: '預算上限' },
    relax_suggestions: [
      { field: 'budget_per_person', current_value: 500, suggested_value: 800, feasible_count_after: 12 },
      { field: 'max_walk_minutes', current_value: 12, suggested_value: 15, feasible_count_after: 4 },
    ],
  },
}
