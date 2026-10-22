import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { isRetryable } from './api/errors'
import { router } from './app/router'
import './index.css'

// 只有「連不上、等太久、伺服器 5xx」才自動再試一次；格式不對、條件不合規定再試也一樣（計畫 P1-2）
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (count, err) => count < 1 && isRetryable(err), refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
