import { expect, test, type Page } from '@playwright/test'

/** 結果頁網址（基準案例條件），可以另外加參數 */
const resultUrl = (extra: string) =>
  `/result?from=${encodeURIComponent('中壢站')}&to=${encodeURIComponent('桃園區')}&date=2026-10-30&t=17:00-23:00&budget=1000&walk=12&${extra}`

const resultsHeading = (page: Page) => page.getByRole('heading', { name: '這 3 個行程，每一段都接得上。' })

test('有解：介紹頁 → 四步精靈 → 篩選動畫 → 三個方案，估計值是黃底（A8）', async ({ page }) => {
  await page.goto('/?proto=timetable')
  await page.getByRole('main').getByRole('link', { name: '開始規劃' }).first().click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '排出接得上的行程' }).click()

  await expect(page.getByText('趕得上開演')).toBeVisible() // 五道關卡動畫
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: '選擇方案' }).getByRole('radio')).toHaveCount(3)
  await expect(page.locator('[data-estimated="true"]').first()).toHaveCSS('background-color', 'rgb(255, 241, 184)')

  await page.getByRole('radio', { name: /^最穩/ }).click()
  await expect(page).toHaveURL(/plan=2/)
  await expect(page.getByLabel('行程時間軸').locator('li').first()).toContainText('17:05')
})

test('無解：停在卡住的關卡，一鍵放寬預算後有解（Q23）', async ({ page }) => {
  await page.goto(resultUrl('budget=500&mock=no_solution').replace('budget=1000&', ''))
  await expect(page.getByRole('heading', { name: '這組條件，找不到每段都接得上的行程' })).toBeVisible()
  await expect(page.getByText('每人不超過 $500')).toBeVisible()
  await page.getByRole('button', { name: /每人預算改成 \$800/ }).click()
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page).toHaveURL(/budget=800/)
})

test('低信心：先問想看哪一部，挑完重算並寫進網址（Q22、Q87）', async ({ page }) => {
  await page.goto(resultUrl('mock=low_confidence'))
  await expect(page.getByRole('heading', { name: '這幾部都接得上，你比較想看哪一部？' })).toBeVisible()
  await page.getByRole('radio', { name: '不存在的罪人' }).click()
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`movie=${encodeURIComponent('不存在的罪人')}`))
})

test('改條件小視窗：預算改 $1,500 重算，網址和花費區同步（Q58、Q62）', async ({ page }) => {
  await page.goto(resultUrl(''))
  await expect(resultsHeading(page)).toBeVisible()
  await page.getByRole('button', { name: '每人 $1,000' }).click()
  await page.getByRole('radio', { name: '$1,500' }).click()
  await page.getByRole('button', { name: '重算' }).click()
  await expect(page).toHaveURL(/budget=1500/)
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page.getByText(/未超過預算 \$1,500/)).toBeVisible()
})

test('試用模式：計時＋小問卷，紀錄出現在系統幕後（Q79、Q80）', async ({ page }) => {
  await page.goto('/?trial=1')
  // 主持人畫面：第 1 位預設 A 版，按下才開始計時
  await expect(page.getByRole('dialog', { name: '試用開始' })).toContainText('第 1 位試用者')
  await page.getByRole('button', { name: '試用者坐好了，開始計時' }).click()
  await page.getByRole('main').getByRole('link', { name: '開始規劃' }).first().click()
  await page.goto('/plan/4')
  await page.getByRole('button', { name: '排出接得上的行程' }).click()
  await expect(resultsHeading(page)).toBeVisible()

  const survey = page.getByRole('form', { name: '試用小問卷' })
  await survey.getByRole('radio', { name: '估計值' }).click()
  await survey.getByRole('radio', { name: '4' }).click()
  await survey.getByRole('radio', { name: '是' }).click()
  await survey.getByRole('button', { name: '送出' }).click()
  await expect(page.getByText('謝謝你的試用！')).toBeVisible()

  // 下一位：回到主持人畫面，版本自動輪到 B
  await page.getByRole('button', { name: '下一位試用者 →' }).click()
  await expect(page.getByRole('dialog', { name: '試用開始' })).toContainText('第 2 位試用者')
  await expect(page.getByRole('radio', { name: 'B 電影感' }).first()).toHaveAttribute('aria-checked', 'true')

  await page.goto('/behind')
  await expect(page.getByRole('heading', { name: '試用紀錄' })).toBeVisible()
  await expect(page.getByText('1 人')).toBeVisible()
})

test('簡報模式：按 2 直接排「週末午後，先吃再看」，按 B 到系統幕後（Q95）', async ({ page }) => {
  await page.goto('/?present=1')
  await expect(page.locator('html')).toHaveAttribute('data-present', '')
  await page.keyboard.press('2')
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page.getByRole('button', { name: '先吃再看' })).toBeVisible()
  await page.keyboard.press('b')
  await expect(page.getByRole('heading', { name: '數字交給程式，選擇交給機率。' })).toBeVisible()
})

test('手機版：畫面不會左右晃、輸入框不會讓 iOS 自動放大', async ({ page, isMobile }) => {
  test.skip(!isMobile, '只在 iPhone 專案跑')
  for (const path of ['/', '/plan/1', '/plan/2', '/plan/4', resultUrl(''), '/behind']) {
    await page.goto(path)
    await page.waitForTimeout(path.startsWith('/result') ? 5000 : 800)
    const [scrollW, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    expect(scrollW, `${path} 超出畫面寬度`).toBeLessThanOrEqual(vw)
  }
  await page.goto('/plan/1')
  const fontSize = await page.getByLabel('搜尋出發站').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
  expect(fontSize).toBeGreaterThanOrEqual(16)
})

test('手機版：估計值的 ⓘ 點一下就看得到說明', async ({ page, isMobile }) => {
  test.skip(!isMobile, '只在 iPhone 專案跑')
  await page.goto(resultUrl(''))
  await expect(resultsHeading(page)).toBeVisible()
  await page.getByRole('button', { name: '這是估計值，點一下看說明' }).first().tap()
  await expect(page.getByRole('tooltip').first()).toHaveText('此價格為估計，實際以現場為準')
})
