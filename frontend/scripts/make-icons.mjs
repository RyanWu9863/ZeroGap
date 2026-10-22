// 產生 iOS「加入主畫面」圖示 public/apple-touch-icon.png（180×180，白底＋logo）。執行：node scripts/make-icons.mjs
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const logo = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 180, height: 180 } })
await page.setContent(`<body style="margin:0;width:180px;height:180px;background:#f7f6f2;display:grid;place-items:center">
  <div style="width:140px;height:140px">${logo.replace('<svg ', '<svg width="140" height="140" ')}</div></body>`)
await page.screenshot({ path: new URL('../public/apple-touch-icon.png', import.meta.url).pathname })
await browser.close()
console.log('public/apple-touch-icon.png 已產生')
