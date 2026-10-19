import { createBrowserRouter, Navigate } from 'react-router'
import { IntroPage } from '@/features/intro/IntroPage'
import { ResultPage } from '@/features/result/ResultPage'
import { WizardPage } from '@/features/wizard/WizardPage'
import { AppShell } from './AppShell'

/** 網址結構（決策 Q29）：/、/plan/1~4、/result、/behind */
export const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      children: [
        { path: '/', element: <IntroPage /> },
        { path: '/plan', element: <Navigate to="/plan/1" replace /> },
        { path: '/plan/:step', element: <WizardPage /> },
        { path: '/result', element: <ResultPage /> },
        // 系統幕後用到圖表套件，延遲載入，不拖慢首頁
        { path: '/behind', lazy: async () => ({ Component: (await import('@/features/behind/BehindPage')).BehindPage }) },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
