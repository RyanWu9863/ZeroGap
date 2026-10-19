import type { ItineraryRequest } from '@/api/schemas'
import { formatMoney } from './format'

/**
 * 五道關卡（AI_CONTEXT §2.1）的白話名稱。id 跟後端濾網編號一致。
 * 使用者畫面只講「趕得上開演」這種話，不講「時空連貫」（Q16）。
 */
export function gateLabels(r: ItineraryRequest): { id: number; label: string }[] {
  return [
    { id: 1, label: '趕得上開演' },
    { id: 2, label: '趕得上點餐' },
    { id: 3, label: `走路不超過 ${r.max_walk_minutes} 分` },
    { id: 4, label: '趕得上回程車' },
    { id: 5, label: `每人不超過 ${formatMoney(r.budget_per_person)}` },
  ]
}

/** 放寬建議的欄位 → 白話（Q23） */
export function relaxLabel(field: string, value: number): string {
  if (field === 'budget_per_person') return `每人預算改成 ${formatMoney(value)}`
  if (field === 'max_walk_minutes') return `步行上限改成 ${value} 分`
  return `${field} 改成 ${value}`
}

/** 過了前 k 道關卡後還剩幾組（後端有給每關剔除數時才算得出來，提案 #7） */
export function remainingAfter(total: number, eliminated: number[] | undefined, k: number): number | null {
  if (!eliminated) return null
  return total - eliminated.slice(0, k).reduce((a, b) => a + b, 0)
}
