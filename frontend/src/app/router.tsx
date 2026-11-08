import { createBrowserRouter, Navigate } from 'react-router'
import { IntroPage } from '@/features/intro/IntroPage'
import { AppShell } from './AppShell'
import { PageLoading } from './PageLoading'
import { NotFound, RouteError } from './RouteError'

/**
 * 網址結構（決策 Q29）：/、/plan/1~4、/result（送出、等待）、/p/:id（排好的行程）、/method、/ai、/about、/behind；其他網址顯示「找不到這一頁」（P0-2）。
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
            // 精靈、結果頁、系統幕後都延遲載入，首頁只下載首頁要用的程式（P2-4：慢速 4G 的首頁 LCP 從 3 秒降下來）
            {
              path: '/plan/:step',
              lazy: async () => ({ Component: (await import('@/features/wizard/WizardPage')).WizardPage }),
              hydrateFallbackElement: <PageLoading />,
            },
            {
              path: '/result',
              lazy: async () => ({ Component: (await import('@/features/result/ResultPage')).ResultPage }),
              hydrateFallbackElement: <PageLoading />,
            },
            {
              path: '/p/:id',
              lazy: async () => ({ Component: (await import('@/features/result/PlanPage')).PlanPage }),
              hydrateFallbackElement: <PageLoading />,
            },
            {
              path: '/method',
              lazy: async () => ({ Component: (await import('@/features/method/MethodPage')).MethodPage }),
              hydrateFallbackElement: <PageLoading />,
            },
            {
              path: '/ai',
              lazy: async () => ({ Component: (await import('@/features/ai/AiPage')).AiPage }),
              hydrateFallbackElement: <PageLoading />,
            },
            {
              path: '/about',
              lazy: async () => ({ Component: (await import('@/features/about/AboutPage')).AboutPage }),
              hydrateFallbackElement: <PageLoading />,
            },
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
