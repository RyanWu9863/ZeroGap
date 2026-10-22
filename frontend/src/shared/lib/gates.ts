import type { PlanRequest } from '@/api/schemas'
import { formatMoney } from './format'

/**
 * 五道關卡的白話名稱：趕得上開演、趕得上點餐、走路不超過上限、趕得上回程車、不超過預算。
 * 使用者畫面只講「趕得上開演」這種話，不講「時空連貫」（Q16）。
 * 後端不回傳每一關剔除幾組（提案 #7 這一版不做），只在無解時給各條件排除的組數（見 relax.ts）。
 */
export function gateLabels(r: PlanRequest): { id: number; label: string }[] {
  return [
    { id: 1, label: '趕得上開演' },
    { id: 2, label: '趕得上點餐' },
    { id: 3, label: `走路不超過 ${r.max_walk_minutes} 分` },
    { id: 4, label: '趕得上回程車' },
    { id: 5, label: `每人不超過 ${formatMoney(r.budget_per_person)}` },
  ]
}
