import { beforeEach, describe, expect, it } from 'vitest'
import { CACHE_KEY, CACHE_TTL_MS, placeKey, readCache, walkKey, writeCache } from './routeCache'

const mem = new Map<string, string>()
beforeEach(() => {
  mem.clear()
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage
})

describe('地圖查詢暫存', () => {
  it('存了拿得回來', () => {
    writeCache(walkKey('e'.repeat(32), 1, 0), [{ lat: 1, lng: 2 }], 0)
    expect(readCache(walkKey('e'.repeat(32), 1, 0), 1)).toEqual([{ lat: 1, lng: 2 }])
  })
  it('7 天後丟掉', () => {
    writeCache('k', 1, 0)
    expect(readCache('k', CACHE_TTL_MS + 1)).toBeNull()
  })
  it('最多 200 筆', () => {
    for (let i = 0; i < 201; i++) writeCache(`k${i}`, i, i)
    expect(readCache('k0', 300)).toBeNull()
    expect(readCache('k200', 300)).toBe(200)
  })
  it('存的東西壞掉回 null', () => {
    mem.set(CACHE_KEY, '壞')
    expect(readCache('k', 0)).toBeNull()
  })
  it('鍵：路線用分享編號＋方案＋第幾段，地點用 place_id', () => {
    expect(walkKey('ab', 2, 3)).toBe('walk:ab:2:3')
    expect(placeKey('ChIJx')).toBe('place:ChIJx')
  })
})
