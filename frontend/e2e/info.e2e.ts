import { expect, test, type Page } from '@playwright/test'

// 底部導覽在 sm（640px）以下才出現；iPad 寬度超過它，會看到頂部導覽，所以用寬度判斷而不是 isMobile
const SM = 640

/** 整頁（含導覽列、頁尾）的文字，只放行兩個已核准的字串：導覽列「AI 助理」、頁尾「在 AI 助理裡使用」 */
async function bodyTextWithoutAccepted(page: Page) {
  const text = await page.locator('body').innerText()
  return text.replaceAll('在 AI 助理裡使用', '').replaceAll('AI 助理', '')
}

test.describe('導覽四顆', () => {
  test('寬螢幕：頂部四顆，點了換頁、目前那顆有標示；沒有幕後', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < SM, '窄螢幕看底部那條')
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主要頁面', exact: true })
    await expect(nav.getByRole('link')).toHaveText(['排行程', '方法', 'AI 助理', '關於'])
    await nav.getByRole('link', { name: '方法' }).click()
    await expect(page).toHaveURL(/\/method$/)
    await expect(nav.getByRole('link', { name: '方法' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('link', { name: /幕後/ })).toHaveCount(0)
  })
  test('窄螢幕：底部四顆都看得到、不換行', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= SM, '寬螢幕看頂部那條')
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: '主要頁面（底部）' })
    const links = nav.getByRole('link')
    await expect(links).toHaveCount(4)
    const tops = await links.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
  })
  test('頁尾有三頁的連結', async ({ page }) => {
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    for (const name of ['方法', '在 AI 助理裡使用', '關於']) await expect(footer.getByRole('link', { name })).toBeVisible()
  })
})

test.describe('方法頁', () => {
  test('往下捲，十段都看得到，數字是真後端範例', async ({ page }) => {
    await page.goto('/method')
    await expect(page.getByRole('heading', { level: 1, name: '我們怎麼確定每一段都接得上' })).toBeVisible()
    const titles = page.getByRole('heading', { level: 2 })
    await expect(titles).toHaveCount(10)
    for (let i = 0; i < 10; i++) {
      await titles.nth(i).scrollIntoViewIfNeeded()
      await expect(titles.nth(i)).toBeVisible()
    }
    await expect(page.getByText('73,038')).toBeVisible()
    await expect(page.getByText('1,201')).toBeVisible()
  })
  test('減少動態：不用捲，十段一打開就都是最後一格', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/method')
    const sections = page.locator('section[id^="method-"]')
    await expect(sections).toHaveCount(10)
    const opacities = await sections.evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))
    expect(opacities).toEqual(Array(10).fill('1'))
  })
  test('有動態時：還沒捲到的那一段一開始是淡的', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/method')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const opacity = await page.locator('#method-9').evaluate((e) => getComputedStyle(e).opacity)
    expect(opacity).not.toBe('1')
  })
  test('不出現 AI、Jev、LLM、機率', async ({ page }) => {
    await page.goto('/method')
    expect(await bodyTextWithoutAccepted(page)).not.toMatch(/\bAI\b|Jev|LLM|機率/)
  })
})

test.describe('AI 助理頁', () => {
  test('六個工具都列出來；展示站（假資料）照實說還不能連', async ({ page }) => {
    await page.goto('/ai')
    for (const t of ['list_areas', 'search_locations', 'list_stations', 'list_categories', 'data_coverage', 'plan_date']) {
      await expect(page.getByText(t, { exact: true })).toBeVisible()
    }
    await expect(page.getByText(/沒有接上真的後端/)).toBeVisible()
    await expect(page.getByText(/claude mcp add/)).toHaveCount(0)
  })
  test('範例句子可以複製', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', '只有 Chromium 能在測試裡給剪貼簿權限')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/ai')
    await page.getByRole('button', { name: /複製/ }).first().click()
    await expect(page.getByRole('button', { name: /已複製/ })).toBeVisible()
  })
  test('不出現 Jev、LLM、機率', async ({ page }) => {
    await page.goto('/ai')
    expect(await page.locator('main').innerText()).not.toMatch(/Jev|LLM|機率/)
  })
})

test.describe('關於頁', () => {
  test('資料來源四項、隱私清單、成員連到 GitHub', async ({ page }) => {
    await page.goto('/about')
    for (const s of ['交通部 TDX', '開眼電影網', 'OpenStreetMap', 'Google']) await expect(page.getByRole('table').getByText(s).first()).toBeVisible()
    await expect(page.getByText('zg-plan-runs')).toBeVisible()
    await expect(page.getByRole('link', { name: /成員/ })).toHaveAttribute('href', 'https://github.com/RyanWu9863/ZeroGap/graphs/contributors')
    expect(await page.locator('main').innerText()).not.toMatch(/@/)
    expect(await bodyTextWithoutAccepted(page)).not.toMatch(/\bAI\b|Jev|LLM|機率/)
  })
  test('手機寬度整頁不會左右捲動', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/about')
    await expect(page.getByRole('table')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test.describe('幕後頁', () => {
  test('不管外觀選什麼，幕後都是夜；有 MCP 流程和六個工具；示範範例標示範', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/behind')
    await expect(page.locator('[data-theme="night"]').first()).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day')
    await expect(page.getByRole('heading', { name: /^從全部組合到/ })).toBeVisible()
    await expect(page.getByText('73,038').first()).toBeVisible()
    await expect(page.getByText('plan_date').first()).toBeVisible()
    await expect(page.getByText('share_url').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /^示範：/ })).toBeVisible()
  })
  test('展示模式：在幕後打開，每一頁頂端都有標籤和「到幕後頁關掉」', async ({ page }) => {
    await page.goto('/behind')
    await page.getByLabel('打開展示模式').check()
    await page.goto('/method')
    await expect(page.getByText(/展示模式：使用預先錄製的回應/)).toBeVisible()
    await page.getByRole('link', { name: '到幕後頁關掉' }).click()
    await expect(page).toHaveURL(/\/behind#demo$/)
    await expect(page.locator('#demo')).toBeInViewport()
    await page.getByLabel('打開展示模式').uncheck()
    await expect(page.getByText(/展示模式：使用預先錄製的回應/)).toHaveCount(0)
  })
})
