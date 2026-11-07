import { expect, type Page } from '@playwright/test'

/*
 * 動畫裡一閃而過的字，用「出現過沒有」來驗，不跟動畫賽跑。
 * 例如篩選動畫的「趕得上開演」只在播放的幾秒內看得到；慢的機器（CI 的 Windows）上，
 * 測試去看的時候動畫可能已經播完、跳到結果頁了。
 * 做法：頁面一載入就開始記錄畫面上出現過的字和元素，之後再問「有沒有出現過」。
 */

declare global {
  interface Window {
    __zgSeen?: Set<string>
  }
}

/** 在 page.goto 之前呼叫：開始記錄這些字（看得到的文字，innerText）和選擇器有沒有出現過 */
export async function watchFor(page: Page, texts: string[], selectors: string[] = []) {
  await page.addInitScript(
    ({ texts, selectors }) => {
      const seen = (window.__zgSeen = new Set<string>())
      const check = () => {
        if (!document.body) return
        const text = document.body.innerText
        for (const t of texts) if (!seen.has(t) && text.includes(t)) seen.add(t)
        for (const s of selectors) if (!seen.has(s) && document.querySelector(s)) seen.add(s)
      }
      new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true })
    },
    { texts, selectors },
  )
}

const hasSeen = (page: Page, key: string) => page.evaluate((k) => window.__zgSeen?.has(k) ?? false, key)

/** 這個字（或選擇器）曾經出現在畫面上 */
export const expectSeen = (page: Page, key: string) => expect.poll(() => hasSeen(page, key)).toBe(true)

/** 這個字（或選擇器）從頭到尾都沒出現過；動畫播完、畫面停下來之後再呼叫 */
export async function expectNeverSeen(page: Page, key: string) {
  expect(await hasSeen(page, key)).toBe(false)
}
