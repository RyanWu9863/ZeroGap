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

/**
 * 每道關卡實際檢查什麼（白話，給可展開的關卡說明用）。
 * 內容照五道濾網的規則寫，不描述個別組合：個別被淘汰的組合後端還沒回傳（API 提案 #10）。
 */
export function gateRule(id: number, r: ItineraryRequest): string {
  const station = r.origin_station
  switch (id) {
    case 1:
      return `從${station}搭車、走到影城，要在電影開演前到。`
    case 2:
      return r.dining_order === '先吃再看' ? '到餐廳時還在營業、來得及點餐，吃完也趕得上開演。' : '散場後走到餐廳，要在最後點餐時間之前。'
    case 3:
      return `影城和餐廳之間，走路不能超過 ${r.max_walk_minutes} 分鐘。`
    case 4:
      return `最後走回車站要趕得上回程車，並且在 ${r.latest_return} 前回到${station}。`
    case 5:
      return `車資、電影票和一餐加起來，每人不超過 ${formatMoney(r.budget_per_person)}。`
    default:
      return ''
  }
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
