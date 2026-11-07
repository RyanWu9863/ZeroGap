import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findPlace, walkPath } from './lookup'
import { placeKey, readCache, walkKey } from './routeCache'

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

const A = { lat: 1, lng: 2 }
const B = { lat: 3, lng: 4 }
const K = walkKey('a'.repeat(32), 1, 0)
const routesWith = (computeRoutes: () => Promise<unknown>) => ({ Route: { computeRoutes } }) as never
const okRoute = () => Promise.resolve({ routes: [{ path: [{ lat: 1, lng: 2 }, { lat: 2, lng: 3 }, { lat: 3, lng: 4 }] }] })

describe('walkPath', () => {
  it('成功：回路線並存進暫存', async () => {
    const path = await walkPath(routesWith(okRoute), K, A, B)
    expect(path).toHaveLength(3)
    expect(readCache(K)).toEqual(path)
  })
  it('暫存有就不再問', async () => {
    await walkPath(routesWith(okRoute), K, A, B)
    const fn = vi.fn(okRoute)
    expect(await walkPath(routesWith(fn), K, A, B)).toHaveLength(3)
    expect(fn).not.toHaveBeenCalled()
  })
  it('查詢丟錯 → null', async () => {
    expect(await walkPath(routesWith(() => Promise.reject(new Error('x'))), K, A, B)).toBeNull()
  })
  it('沒有路線或路線是空的 → null，不存', async () => {
    expect(await walkPath(routesWith(() => Promise.resolve({ routes: [] })), K, A, B)).toBeNull()
    expect(await walkPath(routesWith(() => Promise.resolve({ routes: [{ path: [] }] })), K, A, B)).toBeNull()
    expect(readCache(K)).toBeNull()
  })
  it('函式庫還沒載入 → null', async () => {
    expect(await walkPath(null, K, A, B)).toBeNull()
  })
  it('同時兩個一樣的查詢只送出一次', async () => {
    const fn = vi.fn(okRoute)
    const [x, y] = await Promise.all([walkPath(routesWith(fn), K, A, B), walkPath(routesWith(fn), K, A, B)])
    expect(fn).toHaveBeenCalledTimes(1)
    expect(x).toEqual(y)
  })
})

const placesWith = (fetchFields: () => Promise<unknown>) =>
  ({ Place: class { fetchFields = fetchFields } }) as never
const okPlace = () => Promise.resolve({ place: { location: { lat: () => 24.9, lng: () => 121.2 } } })

describe('findPlace', () => {
  it('成功：回座標並存暫存；之後不再問', async () => {
    expect(await findPlace(placesWith(okPlace), 'ChIJ1')).toEqual({ lat: 24.9, lng: 121.2 })
    expect(readCache(placeKey('ChIJ1'))).toEqual({ lat: 24.9, lng: 121.2 })
    const fn = vi.fn(okPlace)
    await findPlace(placesWith(fn), 'ChIJ1')
    expect(fn).not.toHaveBeenCalled()
  })
  it('丟錯或沒有位置 → null', async () => {
    expect(await findPlace(placesWith(() => Promise.reject(new Error('x'))), 'ChIJ2')).toBeNull()
    expect(await findPlace(placesWith(() => Promise.resolve({ place: { location: null } })), 'ChIJ3')).toBeNull()
  })
  it('同時兩個一樣的查詢只送出一次', async () => {
    const fn = vi.fn(okPlace)
    await Promise.all([findPlace(placesWith(fn), 'ChIJ4'), findPlace(placesWith(fn), 'ChIJ4')])
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
