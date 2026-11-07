import { expect, test } from '@playwright/test'

/** 完整的暫存條件（planStore 逐欄驗證 request 整份；只寫部分欄位會整份被換成預設值） */
const stored = (patch: Record<string, unknown>) => ({
  state: {
    request: {
      area: 'taoyuan',
      origin_station_id: 103,
      origin_lat: null,
      origin_lng: null,
      date: '',
      earliest_departure: '17:00',
      latest_home: '23:00',
      order: 'movie_first',
      movie_id: null,
      movie_genre: null,
      hall_type: null,
      language: null,
      cuisine: 'japanese',
      budget_per_person: 1000,
      max_walk_minutes: 12,
      ...patch,
    },
    selectedRank: 1,
  },
  version: 3,
})

test.describe('首頁', () => {
  test('標題、示範數字、四格快速條件都在；點陣在減少動態時直接是最後一格', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('每一段都接得上')
    await expect(page.getByText('73,038')).toBeVisible()
    await expect(page.getByText('示範：一次真實後端規劃的數字')).toBeVisible()
    await expect(page.getByText(/每點約代表 \d+ 種組合/)).toBeVisible()
    for (const name of ['去哪個商圈', '從哪出發', '哪天', '每人預算']) {
      await expect(page.getByRole('group', { name })).toBeVisible()
    }
  })

  test('四格填好按「排行程」直接到結果頁；之後首頁改用上次的真數字', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00')) // 白天：不走晚上換日期的路
    await page.goto('/')
    await page.getByRole('group', { name: '每人預算' }).getByRole('radio', { name: /1,000/ }).click()
    await page.getByRole('button', { name: '排行程' }).click()
    await expect(page).toHaveURL(/\/result/)
    await expect(page.getByRole('heading', { name: /每一段都接得上/ })).toBeVisible({ timeout: 30_000 })
    await page.goto('/')
    await expect(page.getByText(/你上次排的（假資料/)).toBeVisible() // e2e 跑假後端：數字要標「假資料」
  })

  test('缺商圈時不送出，焦點跳到那一格並說明', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00')) // 白天：不走晚上換日期的路
    await page.addInitScript((v) => localStorage.setItem('zg-plan', v), JSON.stringify(stored({ area: '' })))
    await page.goto('/')
    const area = page.getByRole('group', { name: '去哪個商圈' })
    await expect(area.getByRole('radio').first()).toBeVisible()
    await page.getByRole('button', { name: '排行程' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('alert').filter({ hasText: '請選要去的商圈' })).toHaveCount(1) // 只念一次，不是每格各一個 alert
    await expect(page.getByRole('radiogroup', { name: '商圈' })).not.toHaveAttribute('aria-describedby', /.+/) // 說明只掛在選項上
    // 焦點落在的那個控制項要連到錯誤說明，螢幕閱讀器才念得到
    const focused = area.getByRole('radio').first()
    await expect(focused).toBeFocused()
    await expect(focused).toHaveAccessibleDescription('請選要去的商圈')
    const id = await focused.getAttribute('aria-describedby')
    await expect(page.locator(`#${id}`)).toHaveText('請選要去的商圈')
  })

  test('小視窗的程式還沒載入就按「從哪出發」：載入好直接打開', async ({ page }) => {
    await page.route(/QuickPickers/, async (r) => {
      await new Promise((res) => setTimeout(res, 1500))
      await r.continue()
    })
    await page.goto('/')
    const trigger = page.getByRole('group', { name: '從哪出發' }).getByRole('button')
    await expect(trigger).not.toHaveAttribute('aria-haspopup', /.+/) // 還是暫代按鈕
    await trigger.click()
    await expect(page.getByRole('radiogroup', { name: '出發站' })).toBeVisible()
  })

  test('焦點在暫代按鈕上，小視窗程式載入後焦點移到真的按鈕', async ({ page }) => {
    await page.route(/QuickPickers/, async (r) => {
      await new Promise((res) => setTimeout(res, 1500))
      await r.continue()
    })
    await page.goto('/')
    const trigger = page.getByRole('group', { name: '哪天' }).getByRole('button')
    await expect(trigger).not.toHaveAttribute('aria-haspopup', /.+/)
    await trigger.focus()
    await expect(trigger).toHaveAttribute('aria-haspopup', /.+/, { timeout: 15_000 }) // 換成真的按鈕
    await expect(trigger).toBeFocused()
    await expect(page.getByRole('group', { name: '選擇日期' })).toBeHidden()
  })

  test('下面的「開始規劃」帶回四格、焦點在第一格；旁邊可改用四步精靈', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
    await page.goto('/')
    const first = page.getByRole('group', { name: '去哪個商圈' }).getByRole('radio').first()
    await expect(first).toBeVisible()
    await page.getByRole('link', { name: /^開始規劃/ }).click()
    await expect(first).toBeFocused()
    await expect(page).toHaveURL(/\/$/)
    await page.getByRole('link', { name: '或用四步精靈規劃' }).click()
    await expect(page).toHaveURL(/\/plan\/1/)
  })

  test('場次日期載入失敗：只在「哪天」那格說明＋重試，其他格照樣能用', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
    await page.goto('/?mock=coverage_error') // 假資料情境：前 2 次失敗（含自動重試一次）
    const date = page.getByRole('group', { name: '哪天' })
    await expect(date.getByRole('alert')).toContainText('現在連不上排程服務')
    await expect(page.getByRole('group', { name: '去哪個商圈' }).getByRole('radio').first()).toBeVisible() // 整張卡沒被換掉
    await page.getByRole('button', { name: '排行程' }).click()
    await expect(date.getByRole('button', { name: '重試' })).toBeFocused() // 不知道哪幾天有場次就不送
    await date.getByRole('button', { name: '重試' }).click()
    await expect(date.getByRole('alert')).toHaveCount(0)
  })

  test('「更多條件」進四步精靈', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /更多條件/ }).click()
    await expect(page).toHaveURL(/\/plan\/1/)
  })

  test('常見情境只改條件、不跳頁', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00')) // 白天：不走晚上換日期的路
    await page.goto('/')
    await expect(page.getByRole('group', { name: '去哪個商圈' }).getByRole('radio').first()).toBeVisible() // 商圈載入好、版面不再動才點
    await page.getByRole('button', { name: /小資之夜/ }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('group', { name: '每人預算' }).getByRole('radio', { name: '$500', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('button', { name: /小資之夜/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('出發站、日期用小視窗選，選好就關起來', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
    await page.goto('/')
    await page.getByRole('group', { name: '從哪出發' }).getByRole('button', { name: '中壢站' }).click()
    await page.getByRole('radiogroup', { name: '出發站' }).getByRole('radio', { name: '內壢站' }).click()
    await expect(page.getByRole('radiogroup', { name: '出發站' })).toBeHidden()
    await expect(page.getByRole('group', { name: '從哪出發' }).getByRole('button', { name: '內壢站' })).toBeVisible()
    await page.getByRole('group', { name: '哪天' }).getByRole('button', { name: '11/8（日）' }).click()
    await page.getByRole('button', { name: /^明天/ }).click()
    await expect(page.getByRole('group', { name: '選擇日期' })).toBeHidden()
    await expect(page.getByRole('group', { name: '哪天' }).getByRole('button', { name: '11/9（一）' })).toBeVisible()
  })

  test('晚上打開首頁：今天的出發時間已過，日期換成最近可以排的日子並說明', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T19:00:00+08:00'))
    await page.addInitScript((v) => localStorage.setItem('zg-plan', v), JSON.stringify(stored({ date: '2026-11-08' })))
    await page.goto('/')
    const date = page.getByRole('group', { name: '哪天' })
    await expect(date.getByText('今天 17:00 已經過了，換成最近可以排的 11/9（一）')).toBeVisible()
    await expect(date.getByRole('button', { name: /11\/9（一）/ })).toBeVisible()
  })

  test('原本的日期已經過了：換成最近可以排的日子並說明', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
    await page.addInitScript((v) => localStorage.setItem('zg-plan', v), JSON.stringify(stored({ date: '2026-11-02' })))
    await page.goto('/')
    await expect(page.getByRole('group', { name: '哪天' }).getByText('原本的日期已經過了，換成最近可以排的 11/8（日）')).toBeVisible()
  })

  test('那天沒有場次：換成最近可以排的日子並說明', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
    // 假資料從今天起 14 天都有場次，只故意空掉第 4 天（今天＋3＝11/11），見 mocks/catalog.ts
    await page.addInitScript((v) => localStorage.setItem('zg-plan', v), JSON.stringify(stored({ date: '2026-11-11' })))
    await page.goto('/')
    await expect(page.getByRole('group', { name: '哪天' }).getByText('那天沒有場次，換成最近可以排的 11/8（日）')).toBeVisible()
  })
})
