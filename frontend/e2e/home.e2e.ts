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
    await expect(page).toHaveURL(/\/p\/[0-9a-f]{32}/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: /每一段都接得上/ })).toBeVisible()
    await page.goto('/')
    await expect(page.getByText(/你上次排的（假資料/)).toBeVisible() // e2e 跑假後端：數字要標「假資料」
  })

  /*
   * 2026-11-08 查到「排行程」在整套測試時偶爾沒反應的原因：商圈清單載入前的灰色佔位比真的商圈按鈕寬，
   * iPad、手機上佔兩行、真的商圈只要一行，載入好時「排行程」往上跳 44～48px。
   * 按下去到放開之間剛好跳，放開的位置已經不在按鈕上，瀏覽器就不算點到按鈕，這次點擊不見了。
   */
  test('清單載入前後「排行程」不會移動', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00')) // 白天：日期格不會多出換日期的說明
    await page.goto('/?mock=slow_lists') // 假資料情境：清單和場次日期都晚 2 秒才回
    const button = page.getByRole('button', { name: '排行程' })
    const before = (await button.boundingBox())!
    await expect(page.getByRole('group', { name: '去哪個商圈' }).getByRole('radio').first()).toBeVisible({ timeout: 15_000 })
    const after = (await button.boundingBox())!
    expect(Math.abs(after.y - before.y)).toBeLessThan(1)
  })

  test('清單還在載入時按住「排行程」、載入好才放開：照樣送出', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00')) // 白天：不走晚上換日期的路
    await page.goto('/?mock=slow_lists')
    const button = page.getByRole('button', { name: '排行程' })
    await button.scrollIntoViewIfNeeded()
    const box = (await button.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect(page.getByRole('group', { name: '去哪個商圈' }).getByRole('radio').first()).toBeVisible({ timeout: 15_000 })
    await page.mouse.up()
    await expect(page).toHaveURL(/\/p\/[0-9a-f]{32}/, { timeout: 30_000 })
  })

  /*
   * 2026-11-08：回訪的人存著的日期不能用了（今天的出發時間已過、日期已過、那天沒場次），
   * 場次日期載入好時才知道要換、才冒出換日期的說明。說明原本放在「哪天」那格裡，會把「排行程」往下推，
   * 按下去到放開之間剛好冒出來，放開時已經不在按鈕上，這次點擊就不見了（跟上面商圈佔位同一類問題）。
   */
  const unusableDates = [
    { reason: '今天的出發時間已過', now: '2026-11-08T19:00:00+08:00', date: '2026-11-08', notice: '今天 17:00 已經過了' },
    { reason: '原本的日期已過', now: '2026-11-08T10:00:00+08:00', date: '2026-11-02', notice: '原本的日期已經過了' },
    { reason: '那天沒有場次', now: '2026-11-08T10:00:00+08:00', date: '2026-11-11', notice: '那天沒有場次' },
  ]
  for (const c of unusableDates) {
    test(`存著的日期不能用（${c.reason}）：冒出換日期的說明時「排行程」不會移動`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(c.now))
      await page.addInitScript((v) => localStorage.setItem('zg-plan', v), JSON.stringify(stored({ date: c.date })))
      await page.goto('/?mock=slow_lists') // 清單和場次日期都晚 2 秒才回：說明在載入好之後才冒出來
      const button = page.getByRole('button', { name: '排行程' })
      const before = (await button.boundingBox())!
      const notice = page.getByRole('status').filter({ hasText: c.notice })
      await expect(notice).toBeVisible({ timeout: 15_000 })
      await expect(notice).toContainText('換成最近可以排的')
      const after = (await button.boundingBox())!
      expect(Math.abs(after.y - before.y)).toBeLessThan(1)
    })
  }

  test('存著的日期不能用：按住「排行程」、冒出換日期的說明才放開，照樣送出', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T19:00:00+08:00')) // 晚上：今天 17:00 出發已過
    await page.addInitScript((v) => localStorage.setItem('zg-plan', v), JSON.stringify(stored({ date: '2026-11-08' })))
    const visited: string[] = []
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) visited.push(f.url())
    })
    await page.goto('/?mock=slow_lists')
    const button = page.getByRole('button', { name: '排行程' })
    await button.scrollIntoViewIfNeeded()
    const box = (await button.boundingBox())!
    // 按在按鈕上緣附近：按鈕只要往下移幾 px，放開的位置就不在按鈕上
    await page.mouse.move(box.x + box.width / 2, box.y + 2)
    await page.mouse.down()
    await expect(page.getByRole('status').filter({ hasText: '今天 17:00 已經過了' })).toBeVisible({ timeout: 15_000 })
    await page.mouse.up()
    await expect(page).toHaveURL(/\/p\/[0-9a-f]{32}/, { timeout: 30_000 })
    expect(visited.some((u) => new URL(u).pathname.endsWith('/result'))).toBe(true) // 先到排程中，再到結果
  })

  test('清單還在載入時按「排行程」：按鈕顯示準備中、不能重複送，載入好自動送出', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
    await page.goto('/?mock=slow_lists')
    await page.getByRole('button', { name: '排行程' }).click()
    const busy = page.getByRole('button', { name: '準備中…' })
    await expect(busy).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByRole('alert').filter({ hasText: '準備中，資料載入好就會送出' })).toHaveCount(1) // 螢幕閱讀器念得到
    await busy.click() // 再按一次不會多送一次
    await expect(page).toHaveURL(/\/p\/[0-9a-f]{32}/, { timeout: 30_000 })
    await page.goBack() // 只送了一次：上一頁就回到首頁
    await expect(page).toHaveURL(/\/\?mock=slow_lists$/)
  })

  test('清單一直載入不好：等 10 秒說明原因，可以再試一次；再試一次不叫正在查的請求從頭來', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-08T10:00:00+08:00') })
    let sent = 0 // 假後端每送一次縣市清單記一筆
    page.on('console', (m) => {
      if (m.text().includes('lists_hang：送出 /api/counties')) sent++
    })
    await page.goto('/?mock=lists_hang') // 假資料情境：清單一直不回，跟真的連線一樣 10 秒逾時、自動再查一次
    await page.getByRole('button', { name: '排行程' }).click()
    await expect(page.getByRole('button', { name: '準備中…' })).toBeVisible()
    expect(sent).toBe(1)
    await page.clock.fastForward(10_000)
    const alert = page.getByRole('alert').filter({ hasText: '資料還沒載入好' })
    await expect(alert).toBeVisible()
    await expect(page.getByRole('button', { name: '排行程' })).not.toHaveAttribute('aria-busy', /.+/)
    await expect.poll(() => sent).toBe(2) // 逾時後真的又送了一次
    await alert.getByRole('button', { name: '再試一次' }).click()
    await expect(page.getByRole('button', { name: '準備中…' })).toHaveAttribute('aria-busy', 'true')
    await expect(alert).toBeHidden()
    await expect(page.getByRole('button', { name: '準備中…' })).toBeFocused() // 「再試一次」消失後，焦點交給主按鈕
    await page.waitForTimeout(500)
    expect(sent).toBe(2) // 正在查的那次沒有被取消重送
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
    // 說明放在「排行程」下面（不推動按鈕），「哪天」的按鈕用 aria-describedby 連過去
    await expect(page.getByRole('status').filter({ hasText: '今天 17:00 已經過了，換成最近可以排的 11/9（一）' })).toBeVisible()
    const dateButton = page.getByRole('group', { name: '哪天' }).getByRole('button', { name: /11\/9（一）/ })
    await expect(dateButton).toBeVisible()
    await expect(dateButton).toHaveAccessibleDescription('今天 17:00 已經過了，換成最近可以排的 11/9（一）')
  })

  test('原本的日期已經過了：換成最近可以排的日子並說明', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
    await page.addInitScript((v) => localStorage.setItem('zg-plan', v), JSON.stringify(stored({ date: '2026-11-02' })))
    await page.goto('/')
    await expect(page.getByRole('status').filter({ hasText: '原本的日期已經過了，換成最近可以排的 11/8（日）' })).toBeVisible()
  })

  test('那天沒有場次：換成最近可以排的日子並說明', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+08:00'))
    // 假資料從今天起 14 天都有場次，只故意空掉第 4 天（今天＋3＝11/11），見 mocks/catalog.ts
    await page.addInitScript((v) => localStorage.setItem('zg-plan', v), JSON.stringify(stored({ date: '2026-11-11' })))
    await page.goto('/')
    await expect(page.getByRole('status').filter({ hasText: '那天沒有場次，換成最近可以排的 11/8（日）' })).toBeVisible()
  })
})
