import { expect, test, type Page } from '@playwright/test'
import { expectSeen, watchFor } from './seen'

/*
 * 結果頁流程：/result 只送出、等待；排好換成 /p/編號（重新整理不重排）。
 */
const PLAN_URL = /\/p\/([0-9a-f]{32})/
/** 基準案例：中壢站（id 103）→ 桃園區；沒寫 date＝今天（P0-1） */
const resultUrl = (extra = '') => `/result?from=103&to=taoyuan&t=17:00-23:00&food=japanese&budget=1000&walk=12${extra}`
const resultsHeading = (page: Page) => page.getByRole('heading', { name: '這 3 個行程，每一段都接得上。' })

/** 從首頁四格送出，停在排好的 /p/編號 */
async function planFromHome(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00')) // 白天：不走晚上換日期的路
  await page.goto('/')
  await page.getByRole('group', { name: '每人預算' }).getByRole('radio', { name: /1,000/ }).click()
  await page.getByRole('button', { name: '排行程' }).click()
  await expect(page).toHaveURL(PLAN_URL, { timeout: 30_000 })
}

test('排好後網址換成 /p/編號，重新整理還是同一份、不會重排', async ({ page }) => {
  await planFromHome(page)
  const url = page.url()
  await page.reload()
  await expect(page).toHaveURL(url)
  await expect(page.getByText('正在送出條件')).toHaveCount(0)
  await expect(page.getByRole('radiogroup', { name: '選擇方案' })).toBeVisible()
})

test('上一頁不會回到排程中', async ({ page }) => {
  await planFromHome(page)
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
})

test('亂打的編號顯示找不到、不打後端', async ({ page }) => {
  const calls: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/plans')) calls.push(r.url())
  })
  await page.goto('/p/not-a-real-id')
  await expect(page.getByRole('heading', { name: /找不到這份行程/ })).toBeVisible()
  expect(calls).toEqual([])
})

test('格式對但沒排過的編號顯示找不到', async ({ page }) => {
  await page.goto(`/p/${'0'.repeat(32)}`)
  await expect(page.getByRole('heading', { name: /找不到這份行程/ })).toBeVisible()
})

test('換方案只改 ?plan=，第 1 個方案不帶；重新整理停在同一個方案', async ({ page }) => {
  await page.goto(resultUrl())
  await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('radio', { name: /^最穩/ }).click()
  await expect(page).toHaveURL(/\/p\/[0-9a-f]{32}\?plan=2$/)
  await page.reload()
  await expect(page.getByRole('radio', { name: /^最穩/ })).toBeChecked()
  await page.getByRole('radio', { name: /^最推薦/ }).click()
  await expect(page).toHaveURL(/\/p\/[0-9a-f]{32}$/)
})

test('漏斗：排隊人數、階段一道道亮、念目前階段', async ({ page }) => {
  const texts = ['排隊中，前面還有 1 個人', '排隊中，下一個就輪到你', '篩出每一段都接得上的組合…']
  await watchFor(page, texts)
  await page.goto(resultUrl())
  await expect(page).toHaveURL(PLAN_URL, { timeout: 30_000 })
  for (const t of texts) await expectSeen(page, t)
})

test('漏斗：只有最上面那一行會被念出來，跑完是「每一段都檢查完了」', async ({ page }) => {
  await watchFor(page, ['每一段都檢查完了'], ['[role="status"]'])
  await page.goto(resultUrl())
  const status = page.getByRole('status')
  await expect(status).toHaveCount(1)
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(page.getByRole('list', { name: '規劃進度' })).toBeVisible()
  await expect(page).toHaveURL(PLAN_URL, { timeout: 30_000 })
  await expectSeen(page, '每一段都檢查完了')
})

test('減少動態：跑完直接到結果頁，沒有轉場動畫也不會卡住', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(resultUrl())
  await expect(page).toHaveURL(PLAN_URL, { timeout: 30_000 })
  await expect(page.getByRole('radiogroup', { name: '選擇方案' })).toBeVisible()
})

test.describe('行程路線地圖', () => {
  const map = (page: Page) => page.getByRole('main').getByTestId('route-map')

  test('照時間軸順序編號；點站點看時間和要做的事；鍵盤 Enter 也可以', async ({ page }) => {
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
    await expect(map(page).getByRole('group', { name: /^路線：1\. 中壢站 → 2\. 桃園統領威秀 → 3\. 吉豚屋 → 4\. 桃園站 → 5\. 中壢站$/ })).toBeVisible()
    await map(page).getByRole('button', { name: /第 3 站 吉豚屋/ }).click()
    await expect(map(page).getByText('19:54–20:07')).toBeVisible()
    await map(page).getByRole('button', { name: /第 2 站/ }).focus()
    await page.keyboard.press('Enter')
    await expect(map(page).getByText('17:25–17:55')).toBeVisible()
  })

  test('切到 Google 地圖：沒有金鑰時說明原因並保留示意圖和選中的站；切回來還在', async ({ page }) => {
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
    await map(page).getByRole('button', { name: /第 4 站/ }).click()
    await map(page).getByRole('radio', { name: 'Google 地圖' }).click()
    await expect(map(page).getByRole('status')).toContainText('目前沒有開啟 Google 地圖')
    await expect(map(page).getByText('4. 桃園站')).toBeVisible()
    await map(page).getByRole('radio', { name: '路線示意' }).click()
    await expect(map(page).getByRole('button', { name: /第 4 站/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('換方案時地圖跟著換，選中的站清掉', async ({ page }) => {
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
    await map(page).getByRole('button', { name: /第 3 站/ }).click()
    await page.getByRole('radio', { name: /^最早回到站/ }).click()
    await expect(map(page).getByRole('button', { name: /第 3 站 福勝亭/ })).toBeVisible()
    await expect(map(page).getByText('點站點看那一站的時間和要做的事')).toBeVisible()
  })
})

test.describe('錶盤與方案切換', () => {
  test('錶盤：一打開就看到最緊的一段和後果，按聚光燈可以收起', async ({ page }) => {
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
    const spot = page.getByRole('button', { name: /最緊的一段/ })
    await expect(spot).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#dial-bottleneck')).toContainText(/只要再慢超過|還有車/)
    await spot.click()
    await expect(spot).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#dial-bottleneck')).toBeHidden()
  })

  test('方案用鍵盤 ←／→ 切換，網址跟著換', async ({ page, isMobile }) => {
    test.skip(isMobile, '手機沒有實體鍵盤')
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
    const plans = page.getByRole('radiogroup', { name: '選擇方案' }).getByRole('radio', { checked: true })
    await plans.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/plan=2/)
    await expect(plans).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(page).toHaveURL(/\/p\/[0-9a-f]{32}$/)
  })

  test('手機在錶盤上左滑換到下一個方案', async ({ page, isMobile }) => {
    test.skip(!isMobile, '只在 iPhone、iPad 專案跑')
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
    const dial = page.locator('figure svg').first()
    await dial.scrollIntoViewIfNeeded()
    const box = await dial.boundingBox()
    if (!box) throw new Error('找不到錶盤')
    const y = box.y + box.height / 2
    const figure = page.locator('figure').first()
    // page.mouse 在手機模擬下沒有送出指標事件，直接對錶盤送 pointerdown／pointerup
    const at = (x: number) => ({ clientX: x, clientY: y, pointerType: 'touch', isPrimary: true, bubbles: true })
    await figure.dispatchEvent('pointerdown', at(box.x + box.width - 20))
    await figure.dispatchEvent('pointerup', at(box.x + box.width - 140))
    await expect(page).toHaveURL(/plan=2/)
  })
})
