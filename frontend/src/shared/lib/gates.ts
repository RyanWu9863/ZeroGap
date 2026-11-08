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

/**
 * 每道關卡實際檢查什麼（白話，給可展開的關卡說明用）。
 * 內容照五道濾網的規則寫，不描述個別組合：後端不回傳個別被淘汰的組合（提案 #10）。
 * origin＝出發點的名稱（車站名或「目前位置」），請求裡只有 id，由畫面查好傳進來。
 */
export function gateRule(id: number, r: PlanRequest, origin: string): string {
  switch (id) {
    case 1:
      return `從${origin}搭車、走到影城，要在電影開演前到。`
    case 2:
      return r.order === 'meal_first' ? '到餐廳時還在營業、來得及點餐，吃完也趕得上開演。' : '散場後走到餐廳，要在最後點餐時間之前。'
    case 3:
      return `影城和餐廳之間，走路不能超過 ${r.max_walk_minutes} 分鐘。`
    case 4:
      return `最後要趕得上回程車，並且在 ${r.latest_home} 前回到${origin}。`
    case 5:
      return `車資、電影票和一餐加起來，每人不超過 ${formatMoney(r.budget_per_person)}。`
    default:
      return ''
  }
}
