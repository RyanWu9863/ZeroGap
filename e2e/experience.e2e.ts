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

for (const proto of ['timetable', 'cinematic', 'linear']) {
  test(`無障礙：${proto}・篩選漏斗（展開關卡）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '只在桌機 Chromium 掃')
    await page.goto(resultUrl(`&proto=${proto}`))
    await page.getByRole('button', { name: /趕得上開演/ }).click()
    await expect(page.getByRole('button', { name: '看行程' })).toBeVisible()
    await expectAxeClean(page)
  })
}
