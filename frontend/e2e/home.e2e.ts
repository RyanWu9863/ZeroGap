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
    await page.goto('/')
    await page.getByRole('group', { name: '每人預算' }).getByRole('radio', { name: /1,000/ }).click()
    await page.getByRole('button', { name: '排行程' }).click()
    await expect(page).toHaveURL(/\/result/)
    await expect(page.getByRole('heading', { name: /每一段都接得上/ })).toBeVisible({ timeout: 30_000 })
    await page.goto('/')
    await expect(page.getByText(/你上次排的/)).toBeVisible()
  })

  test('缺商圈時不送出，焦點跳到那一格並說明', async ({ page }) => {
    await page.addInitScript((v) => localStorage.setItem('zg-plan', v), JSON.stringify(stored({ area: '' })))
    await page.goto('/')
    const area = page.getByRole('group', { name: '去哪個商圈' })
    await expect(area.getByRole('radio').first()).toBeVisible()
    await page.getByRole('button', { name: '排行程' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('請選要去的商圈')).toBeVisible()
    await expect(area.getByRole('radio').first()).toBeFocused()
  })

  test('「更多條件」進四步精靈', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /更多條件/ }).click()
    await expect(page).toHaveURL(/\/plan\/1/)
  })

  test('常見情境只改條件、不跳頁', async ({ page }) => {
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

  test('原本的日期沒有場次：換成最近可以排的日子並說明', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
    await page.addInitScript((v) => localStorage.setItem('zg-plan', v), JSON.stringify(stored({ date: '2026-11-02' })))
    await page.goto('/')
    await expect(page.getByRole('group', { name: '哪天' }).getByText('原本的日期沒有場次，換成最近可以排的 11/8（日）')).toBeVisible()
  })
})
