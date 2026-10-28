import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { expectNeverSeen, expectSeen, watchFor } from './seen'

/*
 * 沉浸式新版（?exp=1）的流程測試。預設畫面（沒開開關）由 flows.e2e.ts 照舊測。
 */
const resultUrl = (extra = '') =>
  `/result?from=${encodeURIComponent('中壢站')}&to=${encodeURIComponent('桃園區')}&t=17:00-23:00&budget=1000&walk=12&exp=1${extra}`
const resultsHeading = (page: Page) => page.getByRole('heading', { name: '這 3 個行程，每一段都接得上。' })
const funnel = (page: Page) => page.getByTestId('funnel-run')
/** 進結果頁要先播完漏斗（設計上約 4.5 秒）；CI 的 Windows 機器慢又平行跑，預設 12 秒太緊 */
const AFTER_FUNNEL = { timeout: 30_000 }

/** 換到某個方案：桌機三張都看得到，直接點；手機、平板側邊只露一條邊，改按「下一個方案」轉過去 */
async function pickPlan(page: Page, name: RegExp) {
  const stage = page.getByTestId('plan-stage')
  if ((await stage.getAttribute('data-layout')) === 'three') return stage.getByRole('radio', { name }).click()
  const checked = stage.getByRole('radio', { checked: true })
  for (let i = 0; i < 3; i++) {
    const now = (await checked.textContent()) ?? ''
    if (name.test(now)) return
    await page.getByRole('button', { name: '下一個方案' }).click()
    await expect(checked).not.toHaveText(now) // 等轉完再看下一步，免得多按一次
  }
  await expect(checked).toContainText(name)
}

/**
 * 無障礙掃描測試的時間上限（預設 45 秒不夠）：一條要先播完漏斗、等動畫停、掃 2～3 次 axe，
 * CI 的 Windows 機器忙的時候會超過 45 秒（10/27、10/28 都遇過，重跑就過）
 */
const AXE_TIMEOUT = 120_000

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
    await page.goto(resultUrl('&mock=pending')) // 假資料情境：一直不回應
    await expect(page.getByText('已送出你的條件，正在等排程服務回應')).toBeVisible()
    await expect(page.getByText('待檢查')).toHaveCount(5)
    await expect(page.getByText('還沒收到回應，先不畫任何數字。')).toBeVisible()
    await expect(page.getByText(/已等 \d+ 秒/)).toBeVisible()
    await expect(funnel(page).getByText(/逐關重播/)).toHaveCount(0)
  })

  test('重播用真實數字收斂到 3 個方案，然後自動進結果頁', async ({ page }) => {
    // 收斂畫面只停約 1 秒就自動進結果頁，用「出現過」來驗（見 seen.ts）
    await watchFor(page, ['從 39 種接得上的行程，挑出 3 個', '1 個點 ≈ 16 種組合・共 1,880 種'])
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible(AFTER_FUNNEL)
    await expectSeen(page, '1 個點 ≈ 16 種組合・共 1,880 種')
    await expectSeen(page, '從 39 種接得上的行程，挑出 3 個')
  })

  test('展開關卡看規則和剔除數；看過細節就不自動跳走，按「看行程」才進結果頁', async ({ page }) => {
    await page.goto(resultUrl(), { waitUntil: 'commit' }) // 不等整頁 load（同下方無障礙掃描：字型下載慢時 load 來之前漏斗可能已經播完）
    // 一出現就送點擊、不等進場動畫停下來，免得慢的機器上漏斗先播完跳走（同下方無障礙掃描）
    await page.getByRole('button', { name: /走路不超過 12 分/ }).dispatchEvent('click')
    await expect(page.getByText('影城和餐廳之間，走路不能超過 12 分鐘。')).toBeVisible()
    await expect(page.getByText('淘汰 260 種・還剩 190 種')).toBeVisible()
    await page.waitForTimeout(5000)
    await expect(funnel(page)).toBeVisible()
    await page.getByRole('button', { name: '看行程' }).click()
    await expect(resultsHeading(page)).toBeVisible(AFTER_FUNNEL)
  })

  test('無解：停在卡住的關卡，後面的關卡標「沒檢查」，接著到放寬建議', async ({ page }) => {
    await watchFor(page, ['卡在「每人不超過 $500」這一關'])
    await page.goto(resultUrl('&mock=no_solution').replace('budget=1000', 'budget=500'))
    await expect(page.getByRole('heading', { name: '這組條件，找不到每段都接得上的行程' })).toBeVisible(AFTER_FUNNEL)
    await expectSeen(page, '卡在「每人不超過 $500」這一關')
  })

  test('沒開開關時還是舊的動畫', async ({ page }) => {
    await watchFor(page, ['趕得上開演'], ['[data-testid="funnel-run"]'])
    await page.goto(resultUrl().replace('&exp=1', '&exp=0'))
    await expect(resultsHeading(page)).toBeVisible(AFTER_FUNNEL)
    await expectSeen(page, '趕得上開演') // 舊的五道關卡動畫播過
    await expectNeverSeen(page, '[data-testid="funnel-run"]') // 新版漏斗從頭到尾沒出現
  })
})

test.describe('三方案舞台與詳情（PR3）', () => {
  const stage = (page: Page) => page.getByTestId('plan-stage')
  const open = async (page: Page) => {
    await page.goto(resultUrl())
    await expect(resultsHeading(page)).toBeVisible(AFTER_FUNNEL)
  }

  test('預設最推薦的方案選中；點側邊方案就換到中央，網址跟著換', async ({ page }) => {
    await open(page)
    await expect(stage(page).getByRole('radio', { checked: true })).toContainText('最省')
    await pickPlan(page, /最穩/)
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

  test('方向鍵連按很快（畫面還沒重畫）也不會漏掉或打在舊的卡上', async ({ page }) => {
    await open(page)
    await stage(page).getByRole('radio', { checked: true }).focus()
    // 同一個瞬間送兩次 →：第二次送出時 React 還沒重畫
    await page.evaluate(() => {
      for (let i = 0; i < 2; i++) document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    await expect(stage(page).getByRole('radio', { checked: true })).toContainText('最早回到站')
    await expect(stage(page).getByRole('radio', { checked: true })).toBeFocused()
    await expect(page).toHaveURL(/plan=3/)
  })

  test('轉盤會繞圈：一直按下一個會回到第一個，第一個再按上一個會到最後一個', async ({ page }) => {
    await open(page)
    const checked = stage(page).getByRole('radio', { checked: true })
    for (const name of ['最穩', '最早回到站', '最省']) {
      await page.getByRole('button', { name: '下一個方案' }).click()
      await expect(checked).toContainText(name)
    }
    await page.getByRole('button', { name: '上一個方案' }).click()
    await expect(checked).toContainText('最早回到站')
    await expect(page).toHaveURL(/plan=3/)
  })

  test('桌機：三張方案卡並排、互不重疊，也沒有超出畫面', async ({ page, isMobile }) => {
    test.skip(isMobile, '手機、平板只放一張')
    await open(page)
    await page.waitForTimeout(800)
    const boxes = (await Promise.all((await stage(page).getByRole('radio').all()).map((r) => r.boundingBox()))).map((b) => b!).sort((a, b) => a.x - b.x)
    expect(boxes).toHaveLength(3)
    const vw = page.viewportSize()!.width
    expect(boxes[0].x).toBeGreaterThanOrEqual(0)
    expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x)
    expect(boxes[1].x + boxes[1].width).toBeLessThanOrEqual(boxes[2].x)
    expect(boxes[2].x + boxes[2].width).toBeLessThanOrEqual(vw)
  })

  test('滑鼠拖曳轉動轉盤；放手那一下不會被當成點擊', async ({ page, isMobile }) => {
    test.skip(isMobile, '觸控滑動在 iPhone 真機確認')
    await open(page)
    const box = (await stage(page).boundingBox())!
    const y = box.y + box.height / 2
    const x = box.x + box.width / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(x - i * 30, y)
    await page.mouse.up()
    await expect(stage(page).getByRole('radio', { checked: true })).toContainText('最穩')
    await expect(page).toHaveURL(/plan=2/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
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
    await expect(resultsHeading(page)).toBeVisible(AFTER_FUNNEL)
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
    await pickPlan(page, /最早回到站/)
    await expect(map(page).getByRole('button', { name: /第 3 站 福勝亭/ })).toBeVisible()
    await expect(map(page).getByText('點站點看那一站的時間和要做的事')).toBeVisible()
    await page.getByRole('button', { name: '看完整行程' }).click()
    await expect(page.getByRole('dialog').getByTestId('route-map')).toBeVisible()
  })
})

for (const proto of ['timetable', 'cinematic', 'linear']) {
  test(`無障礙：${proto}・三方案舞台和詳情`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '只在桌機 Chromium 掃')
    test.setTimeout(AXE_TIMEOUT)
    await page.goto(resultUrl(`&proto=${proto}`))
    await expect(resultsHeading(page)).toBeVisible(AFTER_FUNNEL)
    await expectAxeClean(page)
    await page.getByRole('button', { name: '看完整行程' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectAxeClean(page)
  })

  test(`無障礙：${proto}・篩選漏斗（展開關卡）`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '只在桌機 Chromium 掃')
    test.setTimeout(AXE_TIMEOUT)
    // 不等整頁 load：字型等資源下載慢時（CI 的 Windows），load 事件來的時候漏斗可能已經播完、
    // 自動跳到結果頁，關卡按鈕就再也找不到了（用拖慢字型 8 秒重現過）
    await page.goto(resultUrl(`&proto=${proto}`), { waitUntil: 'commit' })
    // 一出現就直接送點擊、不等按鈕「靜止」：慢的機器（CI 的 Windows）上，等關卡的進場動畫停下來時，
    // 漏斗可能已經播完、自動跳到結果頁。展開過關卡就會停在這裡等「看行程」
    await page.getByRole('button', { name: /趕得上開演/ }).dispatchEvent('click')
    await expect(page.getByRole('button', { name: '看行程' })).toBeVisible(AFTER_FUNNEL)
    await expectAxeClean(page)
  })
}

test.describe('系統幕後三種視覺化（PR5）', () => {
  const views = (page: Page) => page.getByTestId('behind-views')

  test('A 篩選漏斗：點某一關看到那一關後剩幾組；重播會從全部組合開始', async ({ page }) => {
    await page.goto('/behind?exp=1')
    const count = views(page).getByTestId('funnel-count')
    await expect(count).toHaveText('39組接得上')
    await views(page).getByRole('button', { name: /^2\. 趕得上點餐/ }).click()
    await expect(count).toHaveText('450組還留著')
    await views(page).getByRole('button', { name: '重播' }).click()
    await expect(count).toHaveText('1,880組（全部）')
    await expect(count).toHaveText('39組接得上', { timeout: 8000 })
  })

  test('B 決策時間軸：只有瀏覽器量得到的時間是真的，排程服務每一步寫明沒有回傳時間', async ({ page }) => {
    await page.goto('/behind?exp=1')
    await views(page).getByRole('tab', { name: 'B 決策時間軸' }).click()
    await expect(views(page).getByText(/來回 \d+\.\d 秒・假資料（開發用）/)).toBeVisible()
    await expect(views(page).getByText('排程服務沒有回傳這一步的時間')).toHaveCount(3)
    await views(page).getByRole('button', { name: /Jev 排序/ }).click()
    await expect(views(page).getByText(/Jev首選・最省：選片 0\.16 × 選餐廳 0\.44 ＝ 0\.07/)).toBeVisible()
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
    await expect(page.getByRole('heading', { name: '五道關卡漏斗' })).toBeVisible()
    await expect(views(page)).toHaveCount(0)
  })
})

for (const proto of ['timetable', 'cinematic', 'linear']) {
  test(`無障礙：${proto}・系統幕後三種視覺化`, async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', '只在桌機 Chromium 掃')
    test.setTimeout(AXE_TIMEOUT)
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
  await expect(resultsHeading(page)).toBeVisible(AFTER_FUNNEL)
  await pickPlan(page, /最穩/)
  await expect(page).toHaveURL(/plan=2/)
  await page.getByRole('button', { name: '看完整行程' }).click()
  await expect(page.getByRole('dialog', { name: '完整行程' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
