import { createBrowserRouter } from 'react-router'
import { IntroPage } from '@/features/intro/IntroPage'
import { ResultPage } from '@/features/result/ResultPage'
import { AppShell } from './AppShell'
import { Placeholder } from './Placeholder'

/** 網址結構（決策 Q29）：/、/plan/1~4、/result、/behind */
export const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      children: [
        { path: '/', element: <IntroPage /> },
        { path: '/plan/:step', element: <Placeholder title="四步規劃精靈" when="第 3–6 天" /> },
        { path: '/result', element: <ResultPage /> },
        { path: '/behind', element: <Placeholder title="系統幕後" when="第 7–8 天" /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
