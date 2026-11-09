import { expect, test } from '@playwright/test'

/*
 * 進場動畫（src/splash/splash.ts，直接寫在 index.html 裡）。
 * 自動化測試預設不播（navigator.webdriver），其他測試不受影響；這裡用 ?intro=1 強制播。
 */

test('自動化測試預設不播，網頁直接可以用', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('#zg-splash')).toHaveCount(0)
})

declare global {
  interface Window {
    __tapAt?: number
    __doneAt?: number
  }
}

test('首頁播完整版，播完自己移除、恢復捲動、記住這個分頁看過了', async ({ page }) => {
  await page.goto('/?intro=1')
  const splash = page.locator('#zg-splash')
  await expect(splash).toHaveAttribute('data-variant', 'full')
  // 動畫蓋在網頁上面，螢幕閱讀器不念；底下的網頁先 inert，按 Tab 不會跑到看不見的連結
  await expect(splash).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('#root')).toHaveAttribute('inert', '')
  await expect(splash).toHaveCount(0, { timeout: 8_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('#root')).not.toHaveAttribute('inert')
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')
  expect(await page.evaluate(() => sessionStorage.getItem('zg-intro-seen'))).toBe('1')
})

test('分享行程等其他頁播縮短版', async ({ page }) => {
  await page.goto('/method?intro=1')
  const splash = page.locator('#zg-splash')
  await expect(splash).toHaveAttribute('data-variant', 'short')
  // 方法頁是延遲載入的，開發伺服器要現場編譯：時限放寬
  await expect(splash).toHaveCount(0, { timeout: 10_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('點一下略過：點下去到播完不到 1.5 秒（沒略過要再等 2 秒以上）', async ({ page }) => {
  // 在頁面裡記時間，不受測試程式和瀏覽器之間來回的延遲影響
  await page.addInitScript(() => {
    addEventListener('pointerdown', () => (window.__tapAt ??= performance.now()), true)
    addEventListener('zg:splash-done', () => (window.__doneAt = performance.now()))
  })
  await page.goto('/?intro=1')
  const splash = page.locator('#zg-splash')
  await expect(splash).toHaveAttribute('data-variant', 'full')
  // 網頁準備好以後再點，量的就只是略過本身
  await page.waitForFunction(() => window.__zgReady === true)
  await splash.click({ position: { x: 20, y: 20 } })
  await expect(splash).toHaveCount(0, { timeout: 6_000 })
  const { tap, end } = await page.evaluate(() => ({ tap: window.__tapAt!, end: window.__doneAt! }))
  expect(end - tap).toBeLessThan(1_500)
})

test('網頁還沒準備好：停在錶盤上等，準備好才展開', async ({ page }) => {
  // 網頁程式晚 5 秒才給（開發版是 /src/main.tsx，正式版是 /assets/index-*.js）
  await page.route(/\/src\/main\.tsx|\/assets\/index-[^/]*\.js$/, async (r) => {
    await new Promise((res) => setTimeout(res, 5_000))
    await r.continue()
  })
  await page.goto('/?intro=1', { waitUntil: 'commit' })
  const splash = page.locator('#zg-splash')
  await expect(splash).toHaveAttribute('data-variant', 'full')
  // 完整版 3.2 秒就該播完；到了 4 秒網頁還沒準備好，動畫應該還在
  await page.waitForFunction(() => performance.now() > 4_000)
  await expect(splash).toHaveCount(1)
  await expect(splash).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('系統開了「減少動態」就不播', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?intro=1')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('#zg-splash')).toHaveCount(0)
})
