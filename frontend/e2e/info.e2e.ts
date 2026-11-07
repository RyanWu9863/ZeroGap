import { expect, test } from '@playwright/test'

// 底部導覽在 sm（640px）以下才出現；iPad 寬度超過它，會看到頂部導覽，所以用寬度判斷而不是 isMobile
const SM = 640

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
  test('減少動態：一打開每一段都已經是最後一格', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/method')
    const last = page.locator('#method-9')
    await last.scrollIntoViewIfNeeded()
    await expect(last).toHaveCSS('opacity', '1')
  })
  test('不出現 AI、Jev、LLM、機率', async ({ page }) => {
    await page.goto('/method')
    const text = await page.locator('main').innerText()
    expect(text).not.toMatch(/\bAI\b|Jev|LLM|機率/)
  })
})
