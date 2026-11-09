import { describe, expect, it } from 'vitest'
import { advance, decideSplash, frameState, HOLD_AT, readoutSeconds, skipTo, TOTAL } from './splash'

const env = (over: Partial<Parameters<typeof decideSplash>[0]> = {}) => ({
  path: '/',
  base: '/',
  search: '',
  seen: false,
  reducedMotion: false,
  webdriver: false,
  ...over,
})

describe('decideSplash：什麼時候播、播哪一版', () => {
  it('首頁第一次打開播完整版', () => {
    expect(decideSplash(env())).toBe('full')
  })

  it('其他頁面（分享行程、方法頁）播縮短版', () => {
    expect(decideSplash(env({ path: '/p/abc123' }))).toBe('short')
    expect(decideSplash(env({ path: '/method' }))).toBe('short')
  })

  it('GitHub Pages 多一層 /ZeroGap/：首頁有沒有斜線結尾都算首頁', () => {
    expect(decideSplash(env({ base: '/ZeroGap/', path: '/ZeroGap/' }))).toBe('full')
    expect(decideSplash(env({ base: '/ZeroGap/', path: '/ZeroGap' }))).toBe('full')
    expect(decideSplash(env({ base: '/ZeroGap/', path: '/ZeroGap/p/abc' }))).toBe('short')
  })

  it('同一個分頁看過了就不再播', () => {
    expect(decideSplash(env({ seen: true }))).toBeNull()
  })

  it('系統開了「減少動態」就不播，連 ?intro=1 也不播', () => {
    expect(decideSplash(env({ reducedMotion: true }))).toBeNull()
    expect(decideSplash(env({ reducedMotion: true, search: '?intro=1' }))).toBeNull()
  })

  it('自動化測試（webdriver）預設不播，?intro=1 強制播', () => {
    expect(decideSplash(env({ webdriver: true }))).toBeNull()
    expect(decideSplash(env({ webdriver: true, search: '?intro=1' }))).toBe('full')
    expect(decideSplash(env({ webdriver: true, seen: true, search: '?a=b&intro=1' }))).toBe('full')
  })

  it('?intro=0 一律不播', () => {
    expect(decideSplash(env({ search: '?intro=0' }))).toBeNull()
  })
})

describe('frameState：每一幕的進度', () => {
  it('完整版：一開始點都還散著，空檔還開著，還沒彎成圓', () => {
    const s = frameState('full', 0)
    expect(s.gather).toBe(0)
    expect(s.gap).toBe(1)
    expect(s.bend).toBe(0)
    expect(s.iris).toBe(0)
  })

  it('完整版：彎成錶盤之前空檔已經歸零', () => {
    const s = frameState('full', 1.8)
    expect(s.gather).toBe(1)
    expect(s.gap).toBe(0)
    expect(s.bend).toBe(0)
  })

  it('完整版：停在等待點時錶盤和 ZG 已經畫完、還沒展開', () => {
    const s = frameState('full', HOLD_AT.full)
    expect(s.bend).toBe(1)
    expect(s.ticks).toBe(1)
    expect(s.zg).toBe(1)
    expect(s.iris).toBe(0)
  })

  it('縮短版：沒有點陣和路線，直接從錶圈開始', () => {
    const s = frameState('short', 0)
    expect(s.particles).toBe(false)
    expect(s.bend).toBe(1)
    expect(frameState('full', 0).particles).toBe(true)
  })

  it('兩版最後一格都完全展開', () => {
    expect(frameState('full', TOTAL.full).iris).toBe(1)
    expect(frameState('short', TOTAL.short).iris).toBe(1)
  })

  it('縮短版約 1 秒、完整版約 3 秒', () => {
    expect(TOTAL.short).toBeGreaterThanOrEqual(0.9)
    expect(TOTAL.short).toBeLessThanOrEqual(1.3)
    expect(TOTAL.full).toBeGreaterThanOrEqual(2.8)
    expect(TOTAL.full).toBeLessThanOrEqual(3.4)
  })
})

describe('advance：網頁還沒準備好就停在錶盤上等', () => {
  it('還沒準備好：時間停在等待點，不會展開到半空的頁面', () => {
    expect(advance('full', HOLD_AT.full - 0.01, 0.5, false)).toBe(HOLD_AT.full)
    expect(advance('full', HOLD_AT.full, 0.5, false)).toBe(HOLD_AT.full)
  })

  it('準備好了：照常往下播', () => {
    expect(advance('full', HOLD_AT.full, 0.1, true)).toBeCloseTo(HOLD_AT.full + 0.1)
  })

  it('等待點之前照常前進', () => {
    expect(advance('short', 0.1, 0.2, false)).toBeCloseTo(0.3)
  })
})

describe('skipTo：點一下略過', () => {
  it('跳到錶盤畫完的那一格，不倒退', () => {
    expect(skipTo('full', 0.4)).toBe(HOLD_AT.full)
    expect(skipTo('short', 0.1)).toBe(HOLD_AT.short)
    expect(skipTo('full', 3.0)).toBe(3.0)
  })

  it('略過後：準備好了接著展開，還沒好就停在錶盤等', () => {
    const t = skipTo('full', 0.4)
    expect(advance('full', t, 0.1, true)).toBeGreaterThan(HOLD_AT.full)
    expect(advance('full', t, 0.1, false)).toBe(HOLD_AT.full)
  })
})

describe('readoutSeconds：空檔計時器', () => {
  it('空檔全開是 00:12，收合後是 00:00', () => {
    expect(readoutSeconds(1)).toBe('00:12')
    expect(readoutSeconds(0)).toBe('00:00')
    expect(readoutSeconds(0.5)).toBe('00:06')
  })
})
