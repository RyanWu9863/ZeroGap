// 手機 4G 載入時間量測（計畫 P2-4）。執行：npm run perf（會先打包，Mac 和 Windows 都能跑）
//
// 做法：用 Playwright 的 Chromium 模擬中階 Android 手機，限制網路速度和 CPU，
// 每次都開全新的瀏覽器環境（沒有快取），量首頁的 FCP、LCP、傳輸量，每種情況跑 3 次取中位數。
// 網路設定參考 Lighthouse 手機版（Slow 4G：RTT 150ms、1.6 Mbps、CPU 慢 4 倍），
// 再加一組比較貼近台灣一般 4G 的設定。這是「實際限速」，通常比 Lighthouse 的「模擬限速」保守一點。
import { spawn, execSync } from 'node:child_process'
import { chromium, devices } from '@playwright/test'

const PORT = 4174
const BASE = `http://localhost:${PORT}`
const RUNS = 3
const KB = 1024

const NETWORKS = [
  { name: 'Slow 4G（Lighthouse 手機標準）', latency: 150, down: (1.6 * KB * KB) / 8 * 0.9, up: (750 * KB) / 8 * 0.9, cpu: 4 },
  { name: '一般 4G', latency: 60, down: (9 * KB * KB) / 8, up: (1.5 * KB * KB) / 8, cpu: 4 },
]
const PAGES = [
  { name: '首頁（A 時刻表）', path: '/?proto=timetable' },
  { name: '首頁（B 電影感）', path: '/?proto=cinematic' },
  { name: '首頁（C Linear 風）', path: '/?proto=linear' },
  { name: '精靈第 1 步', path: '/plan/1' },
]

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

async function measureOnce(browser, net, path) {
  const context = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: net.latency,
    downloadThroughput: net.down,
    uploadThroughput: net.up,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: net.cpu })
  // 在頁面一開始就掛上 LCP 觀察器
  await page.addInitScript(() => {
    window.__lcp = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__lcp = e.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(500)
  const m = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0
    const nav = performance.getEntriesByType('navigation')[0]
    const res = performance.getEntriesByType('resource')
    const bytes = res.reduce((s, r) => s + (r.transferSize || 0), nav?.transferSize || 0)
    const fonts = res.filter((r) => r.name.endsWith('.woff2'))
    return {
      fcp,
      lcp: window.__lcp,
      bytes,
      requests: res.length + 1,
      fontBytes: fonts.reduce((s, r) => s + (r.transferSize || 0), 0),
      fontCount: fonts.length,
    }
  })
  await context.close()
  return m
}

function startPreview() {
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return new Promise((resolve) => child.stdout.on('data', (d) => d.toString().includes(String(PORT)) && resolve(child)))
}

execSync('npx vite build', { stdio: 'inherit' })
const server = await startPreview()
const browser = await chromium.launch()
const rows = []
try {
  for (const net of NETWORKS) {
    for (const pg of PAGES) {
      const runs = []
      for (let i = 0; i < RUNS; i++) runs.push(await measureOnce(browser, net, pg.path))
      const row = {
        網路: net.name,
        頁面: pg.name,
        'FCP 秒': (median(runs.map((r) => r.fcp)) / 1000).toFixed(2),
        'LCP 秒': (median(runs.map((r) => r.lcp)) / 1000).toFixed(2),
        '傳輸 KB': Math.round(median(runs.map((r) => r.bytes)) / KB),
        '字型 KB（檔數）': `${Math.round(median(runs.map((r) => r.fontBytes)) / KB)}（${median(runs.map((r) => r.fontCount))}）`,
        請求數: median(runs.map((r) => r.requests)),
      }
      rows.push(row)
      console.log(JSON.stringify(row))
    }
  }
} finally {
  await browser.close()
  server.kill()
}
console.table(rows)
const worst = Math.max(...rows.map((r) => Number(r['LCP 秒'])))
console.log(worst > 2.5 ? `⚠️ 最慢的 LCP ${worst} 秒，超過 2.5 秒` : `✅ 全部 LCP 都在 2.5 秒內（最慢 ${worst} 秒）`)
