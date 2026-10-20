import { createBrowserRouter, Navigate } from 'react-router'
import { IntroPage } from '@/features/intro/IntroPage'
import { ResultPage } from '@/features/result/ResultPage'
import { WizardPage } from '@/features/wizard/WizardPage'
import { AppShell } from './AppShell'
import { PageLoading } from './PageLoading'
import { NotFound, RouteError } from './RouteError'

/**
 * 網址結構（決策 Q29）：/、/plan/1~4、/result、/behind；其他網址顯示「找不到這一頁」（P0-2）。
 * 錯誤頁有兩層：頁面出錯時留著導覽列（內層）；連外框都出錯時整頁顯示（外層）。
 */
export const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      errorElement: <RouteError />,
      hydrateFallbackElement: <PageLoading />,
      children: [
        {
          errorElement: <RouteError />,
          children: [
            { path: '/', element: <IntroPage /> },
            { path: '/plan', element: <Navigate to="/plan/1" replace /> },
            { path: '/plan/:step', element: <WizardPage /> },
            { path: '/result', element: <ResultPage /> },
            // 系統幕後用到圖表套件，延遲載入，不拖慢首頁
            {
              path: '/behind',
              lazy: async () => ({ Component: (await import('@/features/behind/BehindPage')).BehindPage }),
              hydrateFallbackElement: <PageLoading />,
            },
            { path: '*', element: <NotFound /> },
          ],
        },
      ],
    },
  ],
  // GitHub Pages 的網址會多一層 /repo名稱/，basename 跟著 vite 的 base 走
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)
