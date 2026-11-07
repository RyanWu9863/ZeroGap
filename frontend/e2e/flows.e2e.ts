import { expect, test, type Page } from '@playwright/test'
import { expectSeen, watchFor } from './seen'

/**
 * 結果頁網址（基準案例條件：中壢站 id 103 → 桃園區，照規格書 6.4 存代碼和 id），可以另外加參數。
 * 沒寫 date＝今天（P0-1）
 */
const resultUrl = (extra: string) => `/result?from=103&to=taoyuan&t=17:00-23:00&food=japanese&budget=1000&walk=12${extra ? `&${extra}` : ''}`

const resultsHeading = (page: Page) => page.getByRole('heading', { name: '這 3 個行程，每一段都接得上。' })

test('有解：介紹頁 → 四步精靈 → 等待畫面 → 三個方案，估計值是黃底（A8）、Google 標誌看得到', async ({ page }) => {
  await watchFor(page, ['篩出每一段都接得上的組合'])
  await page.goto('/')
  await page.getByRole('main').getByRole('link', { name: /更多條件/ }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '排出接得上的行程' }).click()

  await expect(resultsHeading(page)).toBeVisible({ timeout: 30_000 })
  await expectSeen(page, '篩出每一段都接得上的組合') // 等待畫面（SSE 進度）出現過（只看得到幾秒，用「出現過」驗，見 seen.ts）
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
  await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00')) // 白天：直接開第 4 步送出時，今天 17:00 出發還沒過
  await page.goto('/plan/4')
  await page.getByRole('button', { name: '排出接得上的行程' }).click()
  await page.getByRole('button', { name: '取消規劃' }).click()
  await expect(page).toHaveURL(/\/plan\/4/)
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
  await expect(page.getByText('原本的日期沒有場次，換成最近可以排的 11/2（一）')).toBeVisible()
  await expect(page.getByRole('group', { name: '選擇日期' }).getByRole('button', { name: '11/2（一）' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '下一步' })).toBeEnabled()
})

test('晚上打開精靈：今天的出發時間已過，第 2 步自動換到最近可以排的日子，可以按下一步', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-08T19:00:00+08:00')) // 預設條件是今天 17:00 出發
  await page.goto('/plan/2')
  await expect(page.getByText('今天 17:00 已經過了，換成最近可以排的 11/9（一）')).toBeVisible()
  const calendar = page.getByRole('group', { name: '選擇日期' })
  await expect(calendar.getByRole('button', { name: '11/9（一）' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '下一步' })).toBeEnabled()
  // 使用者自己選回今天：不再自動換掉，改提醒要選現在之後的出門時間
  await calendar.getByRole('button', { name: '11/8（日）' }).click()
  await expect(calendar.getByRole('button', { name: '11/8（日）' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('今天要選現在之後的出門時間。')).toBeVisible()
  await expect(page.getByRole('button', { name: '下一步' })).toBeDisabled()
})

test('找不到頁面：亂打網址顯示中文說明，導覽列還在，可以回首頁（P0-2）', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { name: '找不到這一頁' })).toBeVisible()
  await expect(page.getByRole('link', { name: '排行程' }).locator('visible=true')).toBeVisible()
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
  await page.goto('/behind')
  await expect(page.getByRole('heading', { name: '這一頁出了點問題' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重新整理' })).toBeVisible()
  await expect(page.getByRole('link', { name: '排行程' }).locator('visible=true')).toBeVisible()
})

test('選項載入失敗：精靈顯示白話說明和重試，按了就恢復（P1-1）', async ({ page }) => {
  await page.goto('/plan/1?mock=options_error') // 假資料情境：前 2 次失敗（含自動重試一次）
  await expect(page.getByRole('alert')).toContainText('現在連不上排程服務')
  await expect(page.getByRole('radiogroup', { name: '商圈' })).toHaveCount(0)
  await page.getByRole('button', { name: '重試' }).click()
  await expect(page.getByRole('radiogroup', { name: '商圈' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
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

test('手機版：畫面不會左右晃、輸入框不會讓 iOS 自動放大', async ({ page, isMobile }) => {
  test.skip(!isMobile, '只在 iPhone、iPad 專案跑')
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
  test.skip(!isMobile, '只在 iPhone、iPad 專案跑')
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
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00')) // 白天：直接開第 4 步送出時，今天 17:00 出發還沒過
    await page.goto('/plan/1')
    await page.getByRole('button', { name: /使用目前位置/ }).click()
    // 等定位寫進條件（zg-plan 暫存有 origin_lat）再換頁，不然有時會帶著舊的出發站
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('zg-plan') ?? '{}').state?.request?.origin_lat ?? null)).not.toBeNull()
    await page.goto('/plan/4')
    await page.getByRole('button', { name: '排出接得上的行程' }).click()
    await expect(page.getByText('目前位置離這個商圈超過 30 公里，請改選出發站')).toBeVisible()
  })
})

test('平板直放：路線示意圖不會被放大到滿版（P2-5）', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipad', '只在 iPad 專案跑')
  await page.goto(resultUrl(''))
  await expect(resultsHeading(page)).toBeVisible()
  const box = await page.getByRole('group', { name: /^路線：/ }).boundingBox()
  expect(box!.width).toBeLessThanOrEqual(320)
})
