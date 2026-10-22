import { expect, test, type Page } from '@playwright/test'

/*
 * 元件邊界情況（計畫 P2-6）：車站搜尋、月曆、改條件小視窗。
 * 照計畫「優先擴充 E2E、不加新套件」；用 page.clock 固定今天，讓月曆的日期每次都一樣。
 * 假資料的可選日期＝今天起 14 天，故意空掉第 4 天（mocks/options.ts）。
 */
const resultUrl = `/result?from=${encodeURIComponent('中壢站')}&to=${encodeURIComponent('桃園區')}&t=17:00-23:00&budget=1000&walk=12`
const resultsHeading = (page: Page) => page.getByRole('heading', { name: '這 3 個行程，每一段都接得上。' })
const day = (page: Page, label: string) => page.getByRole('group', { name: '選擇日期' }).getByRole('button', { name: label, exact: true })

test.describe('車站搜尋', () => {
  test('搜尋不到：顯示白話說明；清掉搜尋字就全部回來', async ({ page }) => {
    await page.goto('/plan/1')
    const list = page.getByRole('radiogroup', { name: '出發站' })
    await expect(list.getByRole('radio')).toHaveCount(6)
    await page.getByLabel('搜尋出發站').fill('台北')
    await expect(list.getByRole('radio')).toHaveCount(0)
    await expect(list).toContainText('找不到「台北」，目前只有桃園市的車站。')
    await page.getByLabel('搜尋出發站').fill('')
    await expect(list.getByRole('radio')).toHaveCount(6)
  })

  test('前後空白會忽略；部分字也找得到；選好的站在清掉搜尋後還是選著', async ({ page }) => {
    await page.goto('/plan/1')
    const list = page.getByRole('radiogroup', { name: '出發站' })
    await page.getByLabel('搜尋出發站').fill('  中壢 ')
    await expect(list.getByRole('radio')).toHaveText(['中壢站'])
    await page.getByLabel('搜尋出發站').fill('桃園')
    await expect(list.getByRole('radio')).toHaveText(['桃園站', '高鐵桃園站'])
    await list.getByRole('radio', { name: '高鐵桃園站' }).click()
    await page.getByLabel('搜尋出發站').fill('')
    await expect(list.getByRole('radio', { checked: true })).toHaveText(['高鐵桃園站'])
  })
})

test.describe('月曆', () => {
  test('跨月：過去和沒場次的日子不能選，翻到下個月可以選，翻回來不會亂', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-25T10:00:00')) // 週日；可選 10/25～11/7，空掉 10/28
    await page.goto('/plan/2')
    await expect(page.getByText('2026 年 10 月')).toBeVisible()
    await expect(day(page, '10/25（日）')).toHaveAttribute('aria-pressed', 'true') // 預設＝今天
    await expect(day(page, '10/24（六）')).toBeDisabled() // 昨天
    await expect(day(page, '10/28（三）')).toBeDisabled() // 沒場次
    await expect(day(page, '10/31（六）')).toBeEnabled()

    await page.getByRole('button', { name: '下個月' }).click()
    await expect(page.getByText('2026 年 11 月')).toBeVisible()
    await expect(day(page, '11/7（六）')).toBeEnabled() // 第 14 天
    await expect(day(page, '11/8（日）')).toBeDisabled() // 超過 14 天
    await day(page, '11/7（六）').click()
    await expect(day(page, '11/7（六）')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '下一步' })).toBeEnabled()

    await page.getByRole('button', { name: '上個月' }).click()
    await expect(page.getByText('2026 年 10 月')).toBeVisible()
    await expect(page.getByRole('group', { name: '選擇日期' }).locator('[aria-pressed="true"]')).toHaveCount(0)
  })

  test('跨年：12 月底翻得到明年 1 月', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-12-28T10:00:00')) // 可選 12/28～2027/1/10，空掉 12/31
    await page.goto('/plan/2')
    await expect(day(page, '12/31（四）')).toBeDisabled()
    await page.getByRole('button', { name: '下個月' }).click()
    await expect(page.getByText('2027 年 1 月')).toBeVisible()
    await day(page, '1/10（日）').click()
    await expect(day(page, '1/10（日）')).toHaveAttribute('aria-pressed', 'true')
    await expect(day(page, '1/11（一）')).toBeDisabled()
  })

  test('快捷鈕：今天剛好是週六時，「本週六」就是今天；沒場次的快捷鈕不能按', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-31T10:00:00')) // 週六；可選 10/31～11/13，空掉 11/3
    await page.goto('/plan/2')
    await expect(page.getByRole('button', { name: /^本週六/ })).toContainText('10/31（六）')
    await expect(page.getByRole('button', { name: /^今天/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: /^本週六/ })).toHaveAttribute('aria-pressed', 'true')

    await page.clock.setFixedTime(new Date('2026-11-04T10:00:00')) // 週三；第 4 天剛好是本週六 11/7，沒場次
    await page.reload()
    await expect(page.getByRole('button', { name: /^本週六/ })).toContainText('11/7（六）')
    await expect(page.getByRole('button', { name: /^本週六/ })).toBeDisabled()
    await expect(page.getByRole('button', { name: /^明天/ })).toBeEnabled()
  })
})

test.describe('改條件小視窗', () => {
  test('沒改就不能重算；改回原值也不能；取消和 Esc 都不會生效', async ({ page }) => {
    await page.goto(resultUrl)
    await expect(resultsHeading(page)).toBeVisible()
    const chip = page.getByRole('button', { name: '每人 $1,000' })
    const dialog = page.getByRole('dialog')

    await chip.click()
    await expect(dialog.getByRole('button', { name: '重算' })).toBeDisabled()
    await dialog.getByRole('radio', { name: '$1,500' }).click()
    await expect(dialog.getByRole('button', { name: '重算' })).toBeEnabled()
    await dialog.getByRole('radio', { name: '$1,000' }).click()
    await expect(dialog.getByRole('button', { name: '重算' })).toBeDisabled()

    await dialog.getByRole('radio', { name: '$2,000' }).click()
    await dialog.getByRole('button', { name: '取消' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(/budget=1000/)

    await chip.click() // 重開時草稿要清掉，回到目前的條件
    await expect(dialog.getByRole('radio', { name: '$1,000' })).toHaveAttribute('aria-checked', 'true')
    await dialog.getByRole('radio', { name: '$500' }).click()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(/budget=1000/)
    await expect(chip).toBeVisible()
  })

  test('改日期可以翻到下個月，重算後網址和標籤都換成新日期', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-25T10:00:00'))
    await page.goto(resultUrl)
    await expect(resultsHeading(page)).toBeVisible()
    await page.getByRole('button', { name: '10/25（日）' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: '下個月' }).click()
    await day(page, '11/3（二）').click()
    await dialog.getByRole('button', { name: '重算' }).click()
    await expect(page).toHaveURL(/date=2026-11-03/)
    await expect(resultsHeading(page)).toBeVisible()
    await expect(page.getByRole('button', { name: '11/3（二）' })).toBeVisible()
  })

  test('改出發站：小視窗裡也能搜尋車站，重算後網址跟著換', async ({ page }) => {
    await page.goto(resultUrl)
    await expect(resultsHeading(page)).toBeVisible()
    await page.getByRole('button', { name: '中壢站 → 桃園區' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('搜尋出發站').fill('楊梅')
    await dialog.getByRole('radio', { name: '楊梅站' }).click()
    await dialog.getByRole('button', { name: '重算' }).click()
    await expect(page).toHaveURL(new RegExp(`from=${encodeURIComponent('楊梅站')}`))
    await expect(page.getByRole('button', { name: '楊梅站 → 桃園區' })).toBeVisible()
  })
})
