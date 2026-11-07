import { expect, test, type Page } from '@playwright/test'

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
