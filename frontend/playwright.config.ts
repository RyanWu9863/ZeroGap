import { defineConfig, devices } from '@playwright/test'

/**
 * 流程測試（決策 Q77、Q89）：用假資料跑完整使用流程。
 * 桌機 Chromium、桌機 WebKit（Safari 核心），加上 iPhone 13（WebKit、觸控、390 寬）、
 * iPad 直放（WebKit、觸控、810 寬，計畫 P2-5）各跑一次。
 * 執行：npm run e2e
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5174', locale: 'zh-TW', timezoneId: 'Asia/Taipei', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] } },
  ],
  // npm run e2e 用開發伺服器（改完馬上測）；CI 和 npm run predemo 先打包再用正式版跑：
  // 開發伺服器要現場編譯延遲載入的頁面，整套平行跑時常常超過時限（CI 的 Windows、本機的 iPhone／iPad 都遇過）。
  // 用 npm 自帶的 npm_lifecycle_event 判斷是不是 predemo，Mac、Windows 都不用另外設環境變數。
  webServer: process.env.CI || process.env.npm_lifecycle_event === 'predemo'
    ? { command: 'npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: false, timeout: 240_000 }
    : { command: 'npm run dev -- --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: false },
})
