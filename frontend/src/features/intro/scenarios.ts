import type { PlanRequest } from '@/api/schemas'

/** 介紹頁的 3 張情境卡（決策 Q85）。正式上線前要用真實資料確認每張都排得出來。 */
export type Scenario = { id: string; title: string; detail: string; patch: Partial<PlanRequest> }

export const SCENARIOS: Scenario[] = [
  {
    id: 'after-work',
    title: '下班後看電影＋晚餐',
    detail: '17:00–23:00・看完再吃・每人 $1,000',
    patch: { earliest_departure: '17:00', latest_home: '23:00', order: 'movie_first', budget_per_person: 1000 },
  },
  {
    id: 'weekend',
    title: '週末午後，先吃再看',
    detail: '12:00–18:00・先吃再看・每人 $800',
    patch: { earliest_departure: '12:00', latest_home: '18:00', order: 'meal_first', budget_per_person: 800 },
  },
  {
    id: 'budget',
    title: '小資之夜',
    detail: '18:00–23:00・看完再吃・每人 $500',
    patch: { earliest_departure: '18:00', latest_home: '23:00', order: 'movie_first', budget_per_person: 500 },
  },
]
