import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { planFigures, swapNotice, swappable, swapView } from './swap'

const label = (code: string | null | undefined) => ({ japanese: '日式', western: '西式' })[code ?? ''] ?? null
const low = mockResult(benchmarkRequest, true)
const p1 = low.plans[0]

describe('換一部／換一家（D2）', () => {
  it('只看 alternatives 有沒有值', () => {
    expect(swappable(p1).restaurant).toHaveLength(2)
    expect(swappable(p1).movie).toHaveLength(2)
    expect(swappable(low.plans[1])).toEqual({ movie: [], restaurant: [] })
  })
  it('換餐廳：到家時間、每人花費換成估計值', () => {
    const v = swapView(p1, { kind: 'restaurant', index: 0 }, label)!
    expect(v).toMatchObject({ name: '福勝亭', original: '吉豚屋', total: 750 })
    expect(planFigures(p1, v)).toEqual({ homeAt: '2026-10-30T21:40:00+08:00', total: 750, estimated: true })
    expect(swapNotice(v)).toBe('時間軸仍是原本的吉豚屋；換成福勝亭的到家時間和花費是估計。')
  })
  it('備選沒有店名時用料理類別', () => {
    expect(swapView(p1, { kind: 'restaurant', index: 1 }, label)!.name).toBe('一家西式餐廳')
  })
  it('換電影時餐廳也跟著換了，要講出來', () => {
    const v = swapView(p1, { kind: 'movie', index: 0 }, label)!
    expect(v.alsoRestaurant).toBe('福勝亭')
    expect(swapNotice(v)).toBe('時間軸仍是原本的《劇場版 魔法少女小圓》；換成《不存在的罪人》（餐廳也換成福勝亭）的到家時間和花費是估計。')
    expect(swapView(p1, { kind: 'movie', index: 1 }, label)!.alsoRestaurant).toBeNull()
  })
  it('沒換就用原本的數字', () => {
    expect(swapView(p1, null, label)).toBeNull()
    expect(planFigures(p1, null)).toEqual({ homeAt: p1.home_at, total: p1.cost_per_person.total, estimated: true })
  })
  it('索引超出範圍當成沒換', () => expect(swapView(p1, { kind: 'restaurant', index: 5 }, label)).toBeNull())
})
