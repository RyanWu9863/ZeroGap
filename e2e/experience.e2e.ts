import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/*
 * 沉浸式新版（?exp=1）的流程測試。預設畫面（沒開開關）由 flows.e2e.ts 照舊測。
 */
/** 基準案例：中壢站（id 103）→ 桃園區；沒寫 date＝今天（P0-1） */
const resultUrl = (extra = '') => `/result?from=103&to=taoyuan&t=17:00-23:00&food=japanese&budget=1000&walk=12&exp=1${extra}`
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
  test('等回應時不假裝在檢查：關卡都是待檢查、沒有任何數字、可以取消', async ({ page }) => {
    await page.goto(resultUrl('&mock=pending')) // 假資料情境：一直不回應
    await expect(page.getByText('正在送出你的條件')).toBeVisible()
    await expect(page.getByText('待檢查')).toHaveCount(5)
    await expect(page.getByText('還沒收到組合數，先不畫任何數字。')).toBeVisible()
    await expect(page.getByText(/已等 \d+:\d{2}/)).toBeVisible()
    await page.getByRole('button', { name: '取消規劃' }).click()
    await expect(page).toHaveURL(/\/plan\/4/)
  })

  test('跟著後端的進度：1,880 種組合 → 39 種接得上，收斂到 3 個方案，然後自動進結果頁', async ({ page }) => {
    await page.goto(resultUrl())
    await expect(page.getByText('1 個點 ≈ 16 種組合・共 1,880 種')).toBeVisible()
    await expect(page.getByText('從 39 種接得上的行程，挑出 3 個')).toBeVisible()
    await expect(resultsHeading(page)).toBeVisible()
  })

  test('展開關卡看規則；看過細節就不自動跳走，按「看行程」才進結果頁', async ({ page }) => {
    await page.goto(resultUrl())
    await page.getByRole('button', { name: /走路不超過 12 分/ }).click()
    await expect(page.getByText('影城和餐廳之間，走路不能超過 12 分鐘。')).toBeVisible()
    await expect(page.getByText('五道關卡在後端一起檢查，這一版不提供每一關各淘汰幾組。')).toBeVisible()
    await expect(page.getByRole('button', { name: '看行程' })).toBeVisible()
    await page.waitForTimeout(3000)
    await expect(funnel(page)).toBeVisible()
    await page.getByRole('button', { name: '看行程' }).click()
    await expect(resultsHeading(page)).toBeVisible()
  })

  test('無解：列出各條件排除的組數，接著到放寬建議', async ({ page }) => {
    await page.goto(resultUrl('&mock=no_solution').replace('budget=1000', 'budget=500'))
    await expect(page.getByText('最常卡在「每人不超過 $500」')).toBeVisible()
    await expect(funnel(page).getByRole('list', { name: '各條件排除的組數' })).toContainText('排除 1,210 種')
    await expect(page.getByRole('heading', { name: '這組條件，找不到每段都接得上的行程' })).toBeVisible()
  })

  test('沒開開關時還是原本的等待畫面', async ({ page }) => {
    await page.goto(resultUrl().replace('&exp=1', '&exp=0'))
    await expect(page.getByRole('list', { name: '規劃進度' })).toBeVisible()
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
    await expect(stage(page).getByRole('radio', { checked: true })).toContainText('最推薦')
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
    await expect(map(page).getByRole('group', { name: /^路線：1\. 中壢站 → 2\. 桃園統領威秀 → 3\. 吉豚屋 → 4\. 桃園站 → 5\. 中壢站$/ })).toBeVisible()
    await map(page).getByRole('button', { name: /第 3 站 吉豚屋/ }).click()
    await expect(map(page).getByText('19:54–20:07')).toBeVisible()
    await map(page).getByRole('button', { name: /第 2 站/ }).focus()
    await page.keyboard.press('Enter')
    await expect(map(page).getByText('17:25–17:55')).toBeVisible()
  })

  test('切到 Google 地圖：沒有金鑰時說明原因並保留示意圖和選中的站；切回來還在', async ({ page }) => {
    await page.goto(resultUrl())
    await map(page).getByRole('button', { name: /第 4 站/ }).click()
    await map(page).getByRole('radio', { name: 'Google 地圖' }).click()
    await expect(map(page).getByRole('status')).toContainText('還沒設定 Google 地圖金鑰')
    await expect(map(page).getByText('4. 桃園站')).toBeVisible()
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

test.describe('系統幕後三種視覺化（PR5）', () => {
  const views = (page: Page) => page.getByTestId('behind-views')

  test('A 篩選漏斗：點某一層看到那一層的組數；重播會從全部組合開始', async ({ page }) => {
    await page.goto('/behind?exp=1')
    const count = views(page).getByTestId('funnel-count')
    await expect(count).toHaveText('3個方案')
    await views(page).getByRole('button', { name: /^每段都接得上/ }).click()
    await expect(count).toHaveText('39組接得上')
    await views(page).getByRole('button', { name: '重播' }).click()
    await expect(count).toHaveText('1,880組（全部）')
    await expect(count).toHaveText('3個方案', { timeout: 8000 })
  })

  test('B 決策時間軸：只有瀏覽器量得到的時間是真的，排程服務每一步寫明沒有回傳時間', async ({ page }) => {
    await page.goto('/behind?exp=1')
    await views(page).getByRole('tab', { name: 'B 決策時間軸' }).click()
    await expect(views(page).getByText('這份結果是先前排好的，沒有量到這次的時間')).toBeVisible()
    await expect(views(page).getByText('排程服務沒有回傳這一步的時間')).toHaveCount(4)
    await views(page).getByRole('button', { name: /Jev 排序/ }).click()
    await expect(views(page).getByText('最推薦：選片 0.71 × 選餐廳 0.64 ＝ 0.45')).toBeVisible()
  })

  test('C 決策比較：每一列標出最好的；寫明被淘汰的組合後端沒有給', async ({ page }) => {
    await page.goto('/behind?exp=1')
    const tabs = views(page).getByRole('tablist')
    await tabs.getByRole('tab', { name: 'A 篩選漏斗' }).focus()
    await page.keyboard.press('ArrowLeft') // 方向鍵循環到最後一個分頁
    await expect(tabs.getByRole('tab', { name: 'C 決策比較' })).toHaveAttribute('aria-selected', 'true')
    await expect(views(page).getByRole('row', { name: /每人花費 \$550 最佳/ })).toBeVisible()
    await expect(views(page).getByText(/API 提案 #10/)).toBeVisible()
  })

  test('沒開開關時還是原本的長條圖和機率表', async ({ page }) => {
    await page.goto('/behind?exp=0')
    await expect(page.getByRole('heading', { name: /^從全部組合到/ })).toBeVisible()
    await expect(views(page)).toHaveCount(0)
  })
})

for (const proto of ['timetable', 'cinematic', 'linear']) {
  test(`無障礙：${proto}・系統幕後三種視覺化`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '只在桌機 Chromium 掃')
    await page.goto(`/behind?exp=1&proto=${proto}`)
    for (const tab of ['A 篩選漏斗', 'B 決策時間軸', 'C 決策比較']) {
      await page.getByRole('tab', { name: tab }).click()
      await expectAxeClean(page)
    }
  })
}

test('減少動態：漏斗、方案舞台、詳情都照常能用（動畫改成直接到位）', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(resultUrl())
  await expect(resultsHeading(page)).toBeVisible()
  await page.getByTestId('plan-stage').getByRole('radio', { name: /最穩/ }).click()
  await expect(page).toHaveURL(/plan=2/)
  await page.getByRole('button', { name: '看完整行程' }).click()
  await expect(page.getByRole('dialog', { name: '完整行程' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
