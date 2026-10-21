import { expect, test, type Page } from '@playwright/test'

/** 結果頁網址（基準案例條件：中壢站 id 103 → 桃園區，照規格書 6.4 存代碼和 id），可以另外加參數 */
const resultUrl = (extra: string) => `/result?from=103&to=taoyuan&date=2026-10-30&t=17:00-23:00&food=japanese&budget=1000&walk=12${extra ? `&${extra}` : ''}`

const resultsHeading = (page: Page) => page.getByRole('heading', { name: '這 3 個行程，每一段都接得上。' })

test('有解：介紹頁 → 四步精靈 → 等待畫面 → 三個方案，估計值是黃底（A8）、Google 標誌看得到', async ({ page }) => {
  await page.goto('/?proto=timetable')
  await page.getByRole('main').getByRole('link', { name: '開始規劃' }).first().click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '排出接得上的行程' }).click()

  await expect(page.getByText('篩出每一段都接得上的組合')).toBeVisible() // 等待畫面（SSE 進度）
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: '選擇方案' }).getByRole('radio')).toHaveCount(3)
  await expect(page.locator('[data-estimated="true"]').first()).toHaveCSS('background-color', 'rgb(255, 241, 184)')
  await expect(page.locator('img[alt="Google Maps"]:visible').first()).toBeVisible()

  await page.getByRole('radio', { name: /^最穩/ }).click()
  await expect(page).toHaveURL(/plan=2/)
  await expect(page.getByLabel('行程時間軸').locator('li').first()).toContainText('17:05')

  // 第 3 案：OSM 來源標出處、營業時間沒核對過要提醒
  await page.getByRole('radio', { name: /^最早回到站/ }).click()
  await expect(page.getByRole('link', { name: 'OpenStreetMap' })).toBeVisible()
  await expect(page.getByText('營業時間未確認，請向店家確認')).toBeVisible()
})

test('等待畫面可以取消，回到精靈第 4 步', async ({ page }) => {
  await page.goto('/plan/4')
  await page.getByRole('button', { name: '排出接得上的行程' }).click()
  await page.getByRole('button', { name: '取消規劃' }).click()
  await expect(page).toHaveURL(/\/plan\/4/)
})

test('無解：列出卡住的條件，一鍵放寬預算後有解（Q23）', async ({ page }) => {
  await page.goto(resultUrl('mock=no_solution').replace('budget=1000', 'budget=500'))
  await expect(page.getByRole('heading', { name: '這組條件，找不到每段都接得上的行程' })).toBeVisible()
  await expect(page.getByText('每人不超過 $500').first()).toBeVisible()
  await page.getByRole('button', { name: /每人預算改成 \$800/ }).click()
  await expect(resultsHeading(page)).toBeVisible()
  await expect(page).toHaveURL(/budget=800/)
})

test('沒有場次、排隊已滿：白話說明', async ({ page }) => {
  await page.goto(resultUrl('mock=no_showtimes'))
  await expect(page.getByRole('heading', { name: '這天沒有符合條件的場次' })).toBeVisible()
  await page.goto(resultUrl('mock=queue_full&budget=1500').replace('budget=1000&', ''))
  await expect(page.getByText('現在排隊的人太多了')).toBeVisible()
})

test('低信心：不插頁，在用餐那步換一家，到家時間和花費變成估計值（D2）', async ({ page }) => {
  await page.goto(resultUrl('mock=low_confidence'))
  await expect(resultsHeading(page)).toBeVisible()
  // 電影備選搭配的餐廳不同時要講出來（v0.11）
  await expect(page.getByTestId('swap-movie')).toContainText('餐廳也會跟著換成福勝亭')
  await page.getByTestId('swap-restaurant').getByRole('button', { name: /換福勝亭/ }).click()
  await expect(page.getByText('時間軸仍是原本的吉豚屋；換成福勝亭的到家時間和花費是估計。')).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: '選擇方案' })).toContainText('約 $750')
  // 一次只換一項：換電影就取消換餐廳
  await page.getByTestId('swap-movie').getByRole('button', { name: /不存在的罪人/ }).click()
  await expect(page.getByText(/換成《不存在的罪人》（餐廳也換成福勝亭）/)).toBeVisible()
  await expect(page.getByTestId('swap-restaurant').getByRole('button', { pressed: true })).toHaveCount(0)
  // 第 2 案：回程的其他班次只看不換（D4）
  await page.getByRole('radio', { name: /^最穩/ }).click()
  await expect(page.getByTestId('other-trains')).toContainText('21:15 出發')
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
    await page.waitForTimeout(path.startsWith('/result') ? 6000 : 800)
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

test.describe('從目前位置出發（2026-10-21）', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 24.9705, longitude: 121.2105 } })

  test('精靈按「使用目前位置」→ 排出行程，網址只寫 from=here、不帶座標', async ({ page }) => {
    await page.goto('/plan/1')
    await page.getByRole('button', { name: /使用目前位置/ }).click()
    await expect(page.getByRole('button', { name: /已使用目前位置/ })).toHaveAttribute('aria-pressed', 'true')
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('button', { name: '排出接得上的行程' }).click()
    await expect(resultsHeading(page)).toBeVisible()
    await expect(page).toHaveURL(/from=here/)
    expect(page.url()).not.toContain('24.97')
    await expect(page.getByLabel('行程時間軸').locator('li').first()).toContainText('目前位置')
    await expect(page.getByLabel('行程時間軸').locator('li').last()).toContainText('回到目前位置')
  })

  test('別人傳來 from=here 的網址：請使用者自己選出發點', async ({ page }) => {
    await page.goto(resultUrl('').replace('from=103', 'from=here'))
    await expect(page.getByRole('heading', { name: '這個行程是從「目前位置」出發的' })).toBeVisible()
    await page.getByRole('button', { name: '選出發點' }).click()
    await expect(page).toHaveURL(/\/plan\/1/)
  })
})

test.describe('目前位置離商圈太遠', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 22.6273, longitude: 120.3014 } }) // 高雄

  test('後端回 400，畫面說明並請改選出發站', async ({ page }) => {
    await page.goto('/plan/1')
    await page.getByRole('button', { name: /使用目前位置/ }).click()
    await page.goto('/plan/4')
    await page.getByRole('button', { name: '排出接得上的行程' }).click()
    await expect(page.getByText('目前位置離這個商圈超過 30 公里，請改選出發站')).toBeVisible()
  })
})
