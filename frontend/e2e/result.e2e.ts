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
    const dial = page.getByTestId('plan-dial').locator('svg').first()
    await dial.scrollIntoViewIfNeeded()
    const box = await dial.boundingBox()
    if (!box) throw new Error('找不到錶盤')
    const y = box.y + box.height / 2
    const figure = page.getByTestId('plan-dial')
    // page.mouse 在手機模擬下沒有送出指標事件，直接對錶盤送 pointerdown／pointerup
    const at = (x: number) => ({ clientX: x, clientY: y, pointerType: 'touch', pointerId: 1, isPrimary: true, bubbles: true })
    await figure.dispatchEvent('pointerdown', at(box.x + box.width - 20))
    await figure.dispatchEvent('pointerup', at(box.x + box.width - 140))
    await expect(page).toHaveURL(/plan=2/)
  })
})

test.describe('分享、行事曆、改條件', () => {
  // 固定在白天：晚上跑的話今天的班次都過了，分享和行事曆會變成過期而不能按
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
  })
  test('分享：電腦複製出 /p/編號 的完整網址', async ({ page, context, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, '剪貼簿權限只在 chromium 電腦版測')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '分享連結' }).click()
    await expect(page.getByText('已複製連結')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/p\/[0-9a-f]{32}$/)
  })

  test('加到行事曆：下載 .ics', async ({ page }) => {
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: '加到行事曆' }).click()
    expect((await dl).suggestedFilename()).toMatch(/\.ics$/)
  })

  test('改條件重排：帶著這份行程的條件回到精靈', async ({ page }) => {
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '改條件重排' }).click()
    await expect(page).toHaveURL(/\/plan\/1/)
  })

  test.describe('從目前位置出發', () => {
    test.use({ permissions: ['geolocation'], geolocation: { latitude: 24.9705, longitude: 121.2105 } })
    test('分享旁邊提醒位置', async ({ page }) => {
      await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
      await page.goto('/plan/1')
      await page.getByRole('button', { name: /使用目前位置/ }).click()
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('zg-plan') ?? '{}').state?.request?.origin_lat ?? null)).not.toBeNull()
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click()
      await page.getByRole('button', { name: '排出接得上的行程' }).click()
      await expect(page).toHaveURL(PLAN_URL, { timeout: 30_000 })
      // 底部固定列和右欄各有一份，任何寬度都只看得到一份
      await expect(page.getByText(/含有你出發的大概位置/).locator('visible=true')).toHaveCount(1)
    })
  })
})

test.describe('分享頁狀態列', () => {
  test('排好時間那一行', async ({ page }) => {
    await planFromHome(page)
    await expect(page.getByText(/這份行程在 \d{2}\/\d{2} \d{2}:\d{2} 排好，班次已確認/)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('過期的行程：顯示過期、可以用同樣條件重排', async ({ page }) => {
    await planFromHome(page)
    await page.clock.setFixedTime(new Date('2026-11-09T10:00:00+08:00')) // 隔天，每個方案都出發過了
    await page.reload()
    await expect(page.getByRole('alert')).toContainText('這份行程已經過期')
    await expect(page.getByRole('button', { name: '加到行事曆' })).toBeDisabled()
    await page.getByRole('button', { name: '用同樣條件重排' }).click()
    await expect(page).toHaveURL(/\/result\?/)
  })

  test('這個方案怎麼來的：展開看得到真數字和備選', async ({ page }) => {
    await page.goto(resultUrl('&mock=low_confidence'))
    await expect(page).toHaveURL(PLAN_URL, { timeout: 30_000 })
    await page.getByText('這個方案怎麼來的').click()
    await expect(page.getByText(/種每段都接得上$/)).toBeVisible()
    await expect(page.getByText('其他也排得進去的選擇')).toBeVisible()
  })
})
