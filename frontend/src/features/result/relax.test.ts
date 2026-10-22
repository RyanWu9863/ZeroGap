import { describe, expect, it } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { reasonLabel, relaxPlan, relaxShowtimes } from './relax'

/** 後端實際的 NO_FEASIBLE（tools/contract-check，2026-10-21） */
const reasons = { showtime: 46718, walk: 22558, opening_hours: 319, last_order: 34, last_train: 2208, budget: 1201 }

describe('relaxPlan（2026-10-20 決定：列原因＋一鍵放寬一級）', () => {
  const { rows, buttons } = relaxPlan(reasons, benchmarkRequest)
  it('原因依排除的組數排序', () => {
    expect(rows.map((r) => r.key)).toEqual(['showtime', 'walk', 'last_train', 'budget', 'opening_hours', 'last_order'])
    expect(rows[0]).toEqual({ key: 'showtime', label: '趕得上開演', count: 46718 })
  })
  it('按鈕最多 3 個，各放寬一級', () => {
    expect(buttons.map((b) => b.label)).toEqual(['最早出門提早到 16:00', '步行上限改成 15 分', '最晚回到站延後到 隔天 00:00'])
    expect(buttons[1].patch).toEqual({ max_walk_minutes: 15 })
  })
  it('營業時間和最後點餐是同一個按鈕（料理改成不限），不重複', () => {
    const b = relaxPlan({ opening_hours: 5, last_order: 3 }, benchmarkRequest).buttons
    expect(b).toEqual([{ label: '料理改成不限', patch: { cuisine: null } }])
  })
  it('預算放寬到下一個選項', () => {
    expect(relaxPlan({ budget: 1 }, { ...benchmarkRequest, budget_per_person: 500 }).buttons[0]).toEqual({ label: '每人預算改成 $800', patch: { budget_per_person: 800 } })
  })
  it('已經是最寬就沒有按鈕', () => {
    expect(relaxPlan({ budget: 1, walk: 1 }, { ...benchmarkRequest, budget_per_person: 2000, max_walk_minutes: 20 }).buttons).toEqual([])
    expect(relaxPlan({ last_train: 1 }, { ...benchmarkRequest, latest_home: '02:00' }).buttons).toEqual([])
  })
  it('認不得的原因只列出來、不給按鈕', () => {
    const r = relaxPlan({ something_new: 9 }, benchmarkRequest)
    expect(r.rows[0].label).toBe('something_new')
    expect(r.buttons).toEqual([])
  })
})

describe('reasonLabel', () => {
  it('帶入使用者的條件', () => {
    expect(reasonLabel('walk', benchmarkRequest)).toBe('走路不超過 12 分')
    expect(reasonLabel('budget', benchmarkRequest)).toBe('每人不超過 $1,000')
  })
})

describe('relaxShowtimes（NO_SHOWTIMES）', () => {
  it('沒有指定電影條件時沒有建議', () => expect(relaxShowtimes(benchmarkRequest)).toBeNull())
  it('指定了電影 → 全部改回不限', () => {
    expect(relaxShowtimes({ ...benchmarkRequest, movie_id: 12, language: '日語' })).toEqual({
      label: '電影改成幫我挑，其他也不限',
      patch: { movie_id: null, movie_genre: null, hall_type: null, language: null },
    })
  })
})
