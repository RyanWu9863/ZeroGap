import { expect, test, type Page } from '@playwright/test'

/** 結果頁網址（基準案例條件），可以另外加參數；沒寫 date＝今天（P0-1） */
const resultUrl = (extra: string) =>
  `/result?from=${encodeURIComponent('中壢站')}&to=${encodeURIComponent('桃園區')}&t=17:00-23:00&budget=1000&walk=12&${extra}`

const resultsHeading = (page: Page) => page.getByRole('heading', { name: '這 3 個行程，每一段都接得上。' })

/**
 * 打開簡報模式，等快捷鍵真的接上才回來。
 * `<html data-present>` 和快捷鍵是同一個 effect 一起裝上的；沒等它就按鍵，
 * 機器忙的時候按鍵會在監聽器裝好之前送出而被吃掉（全套平行跑時 iPhone／iPad 偶爾發生）。
 */
async function openPresentMode(page: Page) {
  await page.goto('/?present=1')
  await expect(page.locator('html')).toHaveAttribute('data-present', '')
}

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

test('日期過期：舊網址先提示再一鍵重排；精靈把舊日期換成最近可選日（P0-1）', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00')) // Demo 當天
  await page.goto(resultUrl('date=2026-10-30'))
  await expect(page.getByRole('heading', { name: '這組行程的日期已經過了' })).toBeVisible()
  await page.getByRole('button', { name: /改成 11\/2（一）/ }).click()
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page).toHaveURL(/date=2026-11-02/)

  // 舊網址又把 10/30 寫回瀏覽器暫存；這時打開精靈第 2 步，要自動換掉並說明
  await page.goto(resultUrl('date=2026-10-30'))
  await expect(page.getByRole('heading', { name: '這組行程的日期已經過了' })).toBeVisible()
  await page.goto('/plan/2')
  await expect(page.getByText('原本選的 10/30（五） 已經過了或沒有場次')).toBeVisible()
  await expect(page.getByRole('group', { name: '選擇日期' }).getByRole('button', { name: '11/2（一）' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '下一步' })).toBeEnabled()
})

test('找不到頁面：亂打網址顯示中文說明，導覽列還在，可以回首頁（P0-2）', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { name: '找不到這一頁' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: '系統幕後' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: '回首頁' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('暫存的條件壞掉：自動改用預設條件，精靈照常能用（P1-3）', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('zg-plan', JSON.stringify({ state: { request: null, selectedRank: 7 }, version: 0 }))
  })
  await page.goto('/plan/1')
  await expect(page.getByRole('heading', { name: '從哪裡出發，去哪裡玩？' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /^桃園區/ })).toHaveAttribute('aria-checked', 'true')
})

test('頁面出錯：頁面檔案下載失敗時顯示中文錯誤頁，導覽列還在（P0-2）', async ({ page }) => {
  // 模擬「更新後舊分頁抓不到新的頁面檔案」：系統幕後的程式檔下載失敗
  await page.route(/BehindPage/, (route) => route.abort())
  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: '系統幕後' }).click()
  await expect(page.getByRole('heading', { name: '這一頁出了點問題' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重新整理' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: '開始規劃' })).toBeVisible()
})

test('選項載入失敗：精靈顯示白話說明和重試，按了就恢復（P1-1）', async ({ page }) => {
  await page.goto('/plan/1?mock=options_error') // 假資料情境：前 2 次失敗（含自動重試一次）
  await expect(page.getByRole('alert')).toContainText('現在連不上排程服務')
  await expect(page.getByRole('radiogroup', { name: '商圈' })).toHaveCount(0)
  await page.getByRole('button', { name: '重試' }).click()
  await expect(page.getByRole('radiogroup', { name: '商圈' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
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
  await openPresentMode(page)
  await page.keyboard.press('2')
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page.getByRole('button', { name: '先吃再看' })).toBeVisible()
  await page.keyboard.press('b')
  await expect(page.getByRole('heading', { name: '數字交給程式，選擇交給機率。' })).toBeVisible()
})

test('簡報模式：情境 2、3 的行程跟條件對得上（時段、先吃再看、預算）', async ({ page }) => {
  await openPresentMode(page)
  await page.keyboard.press('2') // 週末午後：12:00–18:00、先吃再看、每人 $800
  await expect(resultsHeading(page)).toBeVisible()
  const timeline = page.getByLabel('行程時間軸')
  await expect(timeline.locator('li').first()).toContainText('12:10')
  await expect(timeline.locator('li').last()).toContainText('17:03')
  const steps = await timeline.locator('li').allInnerTexts()
  expect(steps.findIndex((t) => t.includes('午餐'))).toBeLessThan(steps.findIndex((t) => t.includes('片長')))

  await page.keyboard.press('3') // 小資之夜：18:00–23:00、每人 $500
  await expect(page.getByRole('button', { name: '每人 $500' })).toBeVisible()
  await expect(resultsHeading(page)).toBeVisible()
  await expect(timeline.locator('li').first()).toContainText('18:20')
  await expect(page.getByText(/未超過預算 \$500/)).toBeVisible()
})

test('手機版：畫面不會左右晃、輸入框不會讓 iOS 自動放大', async ({ page, isMobile }) => {
  test.skip(!isMobile, '只在 iPhone、iPad 專案跑')
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
  test.skip(!isMobile, '只在 iPhone、iPad 專案跑')
  await page.goto(resultUrl(''))
  await expect(resultsHeading(page)).toBeVisible()
  await page.getByRole('button', { name: '這是估計值，點一下看說明' }).first().tap()
  await expect(page.getByRole('tooltip').first()).toHaveText('此價格為估計，實際以現場為準')
})

test('平板直放：路線示意圖不會被放大到滿版（P2-5）', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipad', '只在 iPad 專案跑')
  await page.goto(resultUrl(''))
  await expect(resultsHeading(page)).toBeVisible()
  const box = await page.getByRole('group', { name: /^路線：/ }).boundingBox()
  expect(box!.width).toBeLessThanOrEqual(320)
})

test('資料更新時間跟著今天走：昨晚更新、班次停在前天會提醒；11/10 不會被排在 11/9 前面', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T10:00:00'))
  await page.goto(resultUrl(''))
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page.getByText('場次、餐廳、班次資料更新於 11/10。')).toBeVisible()
  await expect(page.getByText('班次資料為 11/9 19:30 的快照，出發前請再確認一次。')).toBeVisible()
})
