import { defineConfig, devices } from '@playwright/test'

/**
 * 流程測試（決策 Q77、Q89）：用假資料跑完整使用流程。
 * 桌機 Chromium、桌機 WebKit（Safari 核心），加上 iPhone 13（WebKit、觸控、390 寬）各跑一次。
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
  ],
  webServer: { command: 'npm run dev -- --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: false },
})
