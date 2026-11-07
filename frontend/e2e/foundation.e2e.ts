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

const isNarrow = (page: import('@playwright/test').Page) => (page.viewportSize()?.width ?? 0) < 640

test.describe('外框', () => {
  test('頁尾寫出資料更新時間和資料來源', async ({ page }) => {
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    await expect(footer).toContainText('資料更新')
    await expect(footer).toContainText('交通部 TDX')
    await expect(footer.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/RyanWu9863/ZeroGap')
  })

  test('手機底部有導覽，點「排行程」進到精靈第一步', async ({ page }) => {
    test.skip(!isNarrow(page), '底部導覽只在手機寬度出現')
    await page.goto('/')
    const bottom = page.getByRole('navigation', { name: '主要頁面（底部）' })
    await expect(bottom).toBeVisible()
    await bottom.getByRole('link', { name: '排行程' }).click()
    await expect(page).toHaveURL(/\/plan\/1/)
  })

  test('電腦版頂部有導覽，沒有底部導覽', async ({ page }) => {
    test.skip(isNarrow(page), '只看電腦寬度')
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: '主要頁面', exact: true }).getByRole('link', { name: '排行程' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '主要頁面（底部）' })).toBeHidden()
  })
})
