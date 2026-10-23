import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/*
 * 沉浸式新版（?exp=1）的流程測試。預設畫面（沒開開關）由 flows.e2e.ts 照舊測。
 */
const resultUrl = (extra = '') =>
  `/result?from=${encodeURIComponent('中壢站')}&to=${encodeURIComponent('桃園區')}&t=17:00-23:00&budget=1000&walk=12&exp=1${extra}`
const resultsHeading = (page: Page) => page.getByRole('heading', { name: '這 3 個行程，每一段都接得上。' })
const funnel = (page: Page) => page.getByTestId('funnel-run')

/** axe 掃 WCAG 2.1 A／AA，嚴重和重大等級一律要修（同 a11y.e2e.ts）；等動畫跑完再量顏色對比 */
async function expectAxeClean(page: Page) {
  await page.waitForTimeout(300)
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  await page.waitForTimeout(600)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const report = bad.map((v) => `${v.impact} ${v.id}：${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`)
  expect(report, report.join('\n')).toEqual([])
}

test.describe('篩選漏斗（PR2）', () => {
  test('等回應時不假裝逐關檢查：只說已送出、關卡都是待檢查、沒有任何數字', async ({ page }) => {
    await page.clock.install()
    await page.goto(resultUrl())
    await expect(funnel(page)).toBeVisible()
    await page.clock.pauseAt(Date.now() + 50) // 假資料 0.8 秒後才回應；先把時間停住
    await expect(page.getByText('已送出你的條件，正在等排程服務回應')).toBeVisible()
    await expect(page.getByText('待檢查')).toHaveCount(5)
    await expect(page.getByText('還沒收到回應，先不畫任何數字。')).toBeVisible()
    await page.clock.resume()
    await expect(page.getByText(/逐關重播/)).toBeVisible()
  })

  test('重播用真實數字收斂到 3 個方案，然後自動進結果頁', async ({ page }) => {
    await page.goto(resultUrl())
    await expect(page.getByText('從 39 種接得上的行程，挑出 3 個')).toBeVisible()
    await expect(page.getByText('1 個點 ≈ 16 種組合・共 1,880 種')).toBeVisible()
    await expect(resultsHeading(page)).toBeVisible()
  })

  test('展開關卡看規則和剔除數；看過細節就不自動跳走，按「看行程」才進結果頁', async ({ page }) => {
    await page.goto(resultUrl())
    await page.getByRole('button', { name: /走路不超過 12 分/ }).click()
    await expect(page.getByText('影城和餐廳之間，走路不能超過 12 分鐘。')).toBeVisible()
    await expect(page.getByText('淘汰 260 種・還剩 190 種')).toBeVisible()
    await page.waitForTimeout(5000)
    await expect(funnel(page)).toBeVisible()
    await page.getByRole('button', { name: '看行程' }).click()
    await expect(resultsHeading(page)).toBeVisible()
  })

  test('無解：停在卡住的關卡，後面的關卡標「沒檢查」，接著到放寬建議', async ({ page }) => {
    await page.goto(resultUrl('&mock=no_solution').replace('budget=1000', 'budget=500'))
    await expect(page.getByText('卡在「每人不超過 $500」這一關')).toBeVisible()
    await expect(page.getByRole('heading', { name: '這組條件，找不到每段都接得上的行程' })).toBeVisible()
  })

  test('沒開開關時還是舊的動畫', async ({ page }) => {
    await page.goto(resultUrl().replace('&exp=1', '&exp=0'))
    await expect(page.getByText('趕得上開演')).toBeVisible()
    await expect(funnel(page)).toHaveCount(0)
    await expect(resultsHeading(page)).toBeVisible()
  })
})

test.describe('三方案舞台與詳情（PR3）', () => {
  const stage = (page: Page) => page.getByTestId('plan-stage')
  const open = async (page: Page) => {
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible()
  }

  test('預設最推薦的方案選中；點側邊方案就換到中央，網址跟著換', async ({ page }) => {
    await open(page)
    await expect(stage(page).getByRole('radio', { checked: true })).toContainText('最省')
    await stage(page).getByRole('radio', { name: /最穩/ }).click()
    await expect(stage(page).getByRole('radio', { checked: true })).toContainText('最穩')
    await expect(page).toHaveURL(/plan=2/)
    await expect(page.getByLabel('行程時間軸').locator('li').first()).toContainText('17:05')
  })

  test('方向鍵換方案，焦點跟著走', async ({ page }) => {
    await open(page)
    await stage(page).getByRole('radio', { checked: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(stage(page).getByRole('radio', { checked: true })).toBeFocused()
    await expect(page).not.toHaveURL(/plan=1/)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(stage(page).getByRole('radio', { checked: true })).toBeFocused()
  })

  test('看完整行程：展開成對話框、背景點不到；Esc 關掉，焦點回到按鈕，時間軸還在頁面上', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: '看完整行程' }).click()
    const dialog = page.getByRole('dialog', { name: '完整行程' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('行程時間軸')).toBeVisible()
    await expect(page.getByRole('button', { name: '關閉完整行程' })).toBeFocused()
    await expect(page.locator('#root')).toHaveAttribute('inert', '')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
    await expect(page.getByRole('button', { name: '看完整行程' })).toBeFocused()
    await expect(page.getByLabel('行程時間軸')).toBeVisible()
  })

  test('平板、手機不會左右晃（側邊方案卡不能超出畫面）', async ({ page, isMobile }) => {
    test.skip(!isMobile, '只在 iPhone、iPad 專案跑')
    await open(page)
    await page.waitForTimeout(800)
    const [scrollW, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    expect(scrollW).toBeLessThanOrEqual(vw)
  })

  test('點遮罩或 X 都能關', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: '看完整行程' }).click()
    await page.getByRole('button', { name: '關閉完整行程' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: '看完整行程' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.mouse.click(8, 8)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('行程路線地圖（PR4）', () => {
  const map = (page: Page) => page.getByRole('main').getByTestId('route-map')

  test('照時間軸順序編號；點站點看時間和要做的事；鍵盤 Enter 也可以', async ({ page }) => {
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible()
    await expect(map(page).getByRole('group', { name: /^路線：1\. 中壢車站 → 2\. 桃園統領威秀 → 3\. 吉豚屋 → 4\. 桃園車站 → 5\. 中壢車站$/ })).toBeVisible()
    await map(page).getByRole('button', { name: /第 3 站 吉豚屋/ }).click()
    await expect(map(page).getByText('20:06–20:19')).toBeVisible()
    await map(page).getByRole('button', { name: /第 2 站/ }).focus()
    await page.keyboard.press('Enter')
    await expect(map(page).getByText('17:40–17:55')).toBeVisible()
  })

  test('切到 Google 地圖：沒有金鑰時說明原因並保留示意圖和選中的站；切回來還在', async ({ page }) => {
    await page.goto(resultUrl())
    await map(page).getByRole('button', { name: /第 4 站/ }).click()
    await map(page).getByRole('radio', { name: 'Google 地圖' }).click()
    await expect(map(page).getByRole('status')).toContainText('還沒設定 Google 地圖金鑰')
    await expect(map(page).getByText('4. 桃園車站')).toBeVisible()
    await map(page).getByRole('radio', { name: '路線示意' }).click()
    await expect(map(page).getByRole('button', { name: /第 4 站/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('換方案時地圖跟著換，選中的站清掉；詳情裡也有同一張地圖', async ({ page }) => {
    await page.goto(resultUrl())
    await map(page).getByRole('button', { name: /第 3 站/ }).click()
    await page.getByTestId('plan-stage').getByRole('radio', { name: /最早回到站/ }).click()
    await expect(map(page).getByRole('button', { name: /第 3 站 福勝亭/ })).toBeVisible()
    await expect(map(page).getByText('點站點看那一站的時間和要做的事')).toBeVisible()
    await page.getByRole('button', { name: '看完整行程' }).click()
    await expect(page.getByRole('dialog').getByTestId('route-map')).toBeVisible()
  })
})

for (const proto of ['timetable', 'cinematic', 'linear']) {
  test(`無障礙：${proto}・三方案舞台和詳情`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '只在桌機 Chromium 掃')
    await page.goto(resultUrl(`&proto=${proto}`))
    await expect(resultsHeading(page)).toBeVisible()
    await expectAxeClean(page)
    await page.getByRole('button', { name: '看完整行程' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectAxeClean(page)
  })

  test(`無障礙：${proto}・篩選漏斗（展開關卡）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '只在桌機 Chromium 掃')
    await page.goto(resultUrl(`&proto=${proto}`))
    await page.getByRole('button', { name: /趕得上開演/ }).click()
    await expect(page.getByRole('button', { name: '看行程' })).toBeVisible()
    await expectAxeClean(page)
  })
}
