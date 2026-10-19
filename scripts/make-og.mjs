// 產生連結預覽圖 public/og.png（決策 Q96）：貼到 LINE／社群時顯示的那張圖。
// 用 Playwright 的 Chromium 把一段 HTML 截成 1200×630。執行：node scripts/make-og.mjs
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const logo = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const rows = [
  ['17:40', '走 5 分鐘到影城', '開演前還有 10 分'],
  ['20:06', '散場後走到餐廳', '離最後點餐還有 41 分'],
  ['21:21', '走回車站', '回程車開前還有 11 分'],
  ['22:03', '回到中壢站', '比最晚時間早 57 分'],
]
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;width:1200px;height:630px;background:#f7f6f2;font-family:"PingFang TC","Noto Sans TC",sans-serif;color:#14161a;display:flex}
  .l{flex:1;padding:72px 0 72px 80px;display:flex;flex-direction:column;justify-content:space-between}
  .brand{display:flex;align-items:center;gap:16px;font:600 26px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em}
  .brand svg{width:64px;height:64px}
  h1{font-size:54px;line-height:1.25;margin:0;font-weight:800;white-space:nowrap}
  h1 span{color:#1e7a4c}
  p{font-size:22px;color:#5b6068;margin:0;white-space:nowrap}
  .r{width:470px;margin:64px 72px 64px 0;background:#fff;border:1px solid #d9d7cf;border-radius:20px;padding:28px 32px;display:flex;flex-direction:column;justify-content:center;gap:18px}
  .row{display:flex;flex-direction:column;gap:6px}
  .t{font:600 22px ui-monospace,Menlo,monospace}
  .chip{align-self:flex-start;background:#e3f1e9;color:#1e7a4c;border-radius:999px;padding:4px 14px;font-size:18px;font-weight:600}
</style></head><body>
  <div class="l">
    <div class="brand">${logo}ZEROGAP 零空檔</div>
    <div><h1>娛樂、餐廳、交通，<br><span>一次排到剛剛好。</span></h1></div>
    <p>選好條件，每一段都先幫你算好接不接得上。</p>
  </div>
  <div class="r">${rows.map(([t, d, c]) => `<div class="row"><div><span class="t">${t}</span>　${d}</div><span class="chip">✓ ${c}</span></div>`).join('')}</div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname })
await browser.close()
console.log('public/og.png 已產生')
