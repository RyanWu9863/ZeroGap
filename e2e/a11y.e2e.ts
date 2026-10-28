import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/*
 * 無障礙自動檢查（計畫 P2-2）：三個試做版 × 每一頁，用 axe 掃 WCAG 2.1 A／AA。
 * 「嚴重」和「重大」等級的問題一律要修；只在桌機 Chromium 跑一次，顏色對比在三版各自檢查。
 */
const PAGES: { name: string; path: string; ready: (p: Page) => Promise<void> }[] = [
  { name: '介紹頁', path: '/', ready: (p) => p.getByRole('heading', { level: 1 }).first().waitFor() },
  ...[1, 2, 3, 4].map((n) => ({
    name: `精靈第 ${n} 步`,
    path: `/plan/${n}`,
    ready: (p: Page) => p.getByRole('button', { name: n < 4 ? '下一步' : '排出接得上的行程' }).waitFor(),
  })),
  {
    name: '結果頁',
    path: `/result?from=${encodeURIComponent('中壢站')}&to=${encodeURIComponent('桃園區')}&t=17:00-23:00&budget=1000&walk=12`,
    ready: (p) => p.getByRole('heading', { name: '這 3 個行程，每一段都接得上。' }).waitFor(),
  },
  { name: '系統幕後', path: '/behind', ready: (p) => p.getByRole('heading', { name: '五道關卡漏斗' }).waitFor() },
  { name: '找不到頁面', path: '/no-such-page', ready: (p) => p.getByRole('heading', { name: '找不到這一頁' }).waitFor() },
]

for (const proto of ['timetable', 'cinematic', 'linear']) {
  for (const pg of PAGES) {
    test(`無障礙：${proto}・${pg.name}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium', '只在桌機 Chromium 掃一次')
      test.setTimeout(120_000) // 結果頁要先播完篩選動畫；CI 的 Windows 機器忙時預設 45 秒會不夠（同 experience.e2e.ts 的 AXE_TIMEOUT）
      const sep = pg.path.includes('?') ? '&' : '?'
      await page.goto(`${pg.path}${sep}proto=${proto}`)
      await pg.ready(page)
      // 等進場動畫全部跑完（淡入到一半時顏色會比較淡），顏色對比才量得準
      await page.waitForTimeout(300)
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
      await page.waitForTimeout(300)
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      const report = bad.map((v) => `${v.impact} ${v.id}：${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`)
      expect(report, report.join('\n')).toEqual([])
    })
  }
}

test('換步驟時焦點移到新的標題，分頁標題跟著換（P2-2）', async ({ page }) => {
  await page.goto('/plan/1')
  await expect(page).toHaveTitle('① 地點｜零空檔')
  await expect(page.getByRole('heading', { level: 1, name: '從哪裡出發，去哪裡玩？' })).not.toBeFocused() // 第一次進來不搶焦點
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '哪一天、幾點到幾點？' })).toBeFocused()
  await expect(page).toHaveTitle('② 時間｜零空檔')
  await page.goto('/no-such-page')
  await expect(page).toHaveTitle('找不到這一頁｜零空檔')
})

/**
 * 一直按 Tab，直到焦點落在指定文字的按鈕上（最多 80 次），再按 Enter。
 * Safari 預設 Tab 不會跳到按鈕，Safari 使用者要按 Option+Tab，所以 WebKit 用 Alt+Tab。
 */
async function tabAndPress(page: Page, text: string, key: string) {
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press(key)
    const label = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
    if (label.startsWith(text)) return page.keyboard.press('Enter')
  }
  throw new Error(`按了 80 次 Tab 都沒有到「${text}」`)
}

test('只用鍵盤就能走完四步精靈（P2-2）', async ({ page, browserName }, info) => {
  test.skip(info.project.name === 'iphone', '手機沒有實體鍵盤')
  const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
  await page.goto('/plan/1')
  for (let i = 0; i < 3; i++) await tabAndPress(page, '下一步', key)
  await tabAndPress(page, '排出接得上的行程', key)
  await expect(page.getByRole('heading', { name: '這 3 個行程，每一段都接得上。' })).toBeVisible()
})
