import { expect, test } from '@playwright/test'

test.describe('外觀：夜／日', () => {
  test('手機是深色模式時，第一次打開就是夜', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  })

  test('手機是淺色模式時是日；按外觀鈕依序換成夜、日，重新整理後還記得', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'day')
    await page.getByRole('button', { name: /^外觀：跟著手機/ }).click()
    await expect(html).toHaveAttribute('data-theme', 'night')
    await page.getByRole('button', { name: /^外觀：夜/ }).click()
    await expect(html).toHaveAttribute('data-theme', 'day')
    await page.reload()
    await expect(html).toHaveAttribute('data-theme', 'day')
    await expect(page.getByRole('button', { name: /^外觀：日/ })).toBeVisible()
  })
})
