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
