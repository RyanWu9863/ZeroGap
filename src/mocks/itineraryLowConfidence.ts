import type { ItineraryResponse } from '@/api/schemas'
import { itineraryOk } from './itineraryOk'

/**
 * 開發用假資料：系統拿不定（閥門 0.60 沒過），不確定的是「電影」（提案 #6）。
 * 使用者挑了片之後重送，假資料就回傳一般的有解結果。
 */
export const itineraryLowConfidence: ItineraryResponse = {
  ...itineraryOk,
  confidence_gate: {
    threshold: 0.6,
    passed: false,
    uncertain_field: 'movie',
    choices: [
      { id: 12, label: '劇場版 魔法少女小圓' },
      { id: 15, label: '不存在的罪人' },
    ],
  },
}
