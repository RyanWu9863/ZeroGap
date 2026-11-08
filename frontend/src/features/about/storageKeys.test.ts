import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from './storageKeys'

// 掃 src 底下所有程式（不含測試）裡出現的 'zg-…' 儲存名稱
const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const used = new Set<string>()
const patterns = [
  /(?:name:\s*|_KEY\s*=\s*)['"`](zg-[a-z0-9-]+)['"`]/g, // persist 的 name、常數
  /(?:get|set|remove)Item\(\s*['"`](zg-[a-z0-9-]+)['"`]/g, // 直接呼叫 localStorage / sessionStorage
]
for (const code of Object.values(sources)) for (const re of patterns) for (const m of code.matchAll(re)) used.add(m[1])

describe('關於頁列出的瀏覽器儲存', () => {
  it('跟程式裡真的用到的一致', () => {
    expect(new Set(STORAGE_KEYS.map((k) => k.key))).toEqual(used)
  })
  it('每一項都有白話說明和保留多久', () => {
    for (const k of STORAGE_KEYS) {
      expect(k.what.length).toBeGreaterThan(4)
      expect(k.keep.length).toBeGreaterThan(1)
    }
  })
})
