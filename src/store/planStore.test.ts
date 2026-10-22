import { describe, expect, it, vi } from 'vitest'
import { benchmarkRequest } from '@/mocks/request'
import { mergePlanState, usePlanStore } from './planStore'

/** 拿 persist 的 merge 來測：模擬「從暫存讀回來」 */
const mergePlan = (persisted: unknown) => mergePlanState(persisted, usePlanStore.getInitialState())

describe('zg-plan 暫存讀回（P1-3）', () => {
  it('條件壞掉 → 用預設條件，其他合格的欄位留著', () => {
    const s = mergePlan({ request: null, selectedRank: 2 })
    expect(s.request).toEqual(benchmarkRequest)
    expect(s.selectedRank).toBe(2)
  })
  it('舊版多出來的欄位會被拿掉，合格的條件照用', () => {
    const s = mergePlan({ request: { ...benchmarkRequest, budget_per_person: 800, old_field: 1 } })
    expect(s.request.budget_per_person).toBe(800)
    expect(s.request).not.toHaveProperty('old_field')
  })
  it('方案編號超出 1–3 → 回到第 1 案', () => expect(mergePlan({ selectedRank: 9 }).selectedRank).toBe(1))
})

describe('zg-trial 暫存讀回（P1-3）', () => {
  it('壞掉的那筆試用紀錄丟掉，其他紀錄一定留著', async () => {
    vi.stubGlobal('window', { location: { search: '' } })
    const { mergeTrialState, useTrialStore } = await import('@/features/trial/trialStore')
    const good = { id: 'a1', proto: 'timetable', startedAt: 1, resultAt: 2, answers: { yellow: 'estimate', willing: 4, faster: true } }
    const s = mergeTrialState({ sessions: [good, { id: 3 }], current: 'bad', active: true }, useTrialStore.getInitialState())
    expect(s.sessions).toEqual([good])
    expect(s.current).toBeNull()
    expect(s.active).toBe(true)
    vi.unstubAllGlobals()
  })
})
