import { Home, RotateCw } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { LogoMark } from '@/shared/brand/Logo'
import { markAppReady } from '@/splash/ready'
import { usePageTitle } from '@/shared/lib/usePageTitle'

/*
 * 錯誤頁和找不到頁面（計畫 P0-2）。取代 React Router 預設的英文白底錯誤頁。
 * 這裡刻意不讀任何 store：出錯的原因可能正是 store 裡的資料壞了。
 */

const btn = 'inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-sm font-medium'
const primary = `${btn} bg-primary text-primary-foreground`
const secondary = `${btn} border hover:bg-muted`

function ErrorLayout({ title, children, actions, footer }: { title: string; children: ReactNode; actions: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <LogoMark size={48} />
      <h1 className="mt-6 text-2xl font-bold">{title}</h1>
      <div className="mt-3 space-y-2 text-muted-foreground">{children}</div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>
      {footer}
    </div>
  )
}

/** 網址打錯、或舊連結已經沒有這一頁 */
export function NotFound() {
  usePageTitle('找不到這一頁')
  return (
    <ErrorLayout
      title="找不到這一頁"
      actions={
        <>
          <Link to="/" className={primary}>
            <Home className="size-4" /> 回首頁
          </Link>
          <Link to="/plan/1" className={secondary}>
            開始規劃
          </Link>
        </>
      }
    >
      <p>網址可能打錯了，或這一頁已經搬家。</p>
    </ErrorLayout>
  )
}

/** 只清掉「規劃條件」的暫存 */
function clearPlanAndReload() {
  try {
    localStorage.removeItem('zg-plan')
  } catch {
    // 瀏覽器不給存取暫存時，重新整理也一樣
  }
  window.location.reload()
}

/** 畫面程式出錯、或延遲載入的頁面下載失敗 */
export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  usePageTitle(notFound ? '找不到這一頁' : '出了點問題') // 外層的標題會蓋過內層，所以這裡也要分清楚
  // 連外框都出錯時 AppShell 不會畫出來：由錯誤頁告訴進場動畫可以展開，不用等滿 8 秒
  useEffect(markAppReady, [])
  if (notFound) return <NotFound />
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return (
    <ErrorLayout
      title="這一頁出了點問題"
      footer={
        import.meta.env.DEV && (
          <details className="mt-10 w-full text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer">技術細節（只在開發模式顯示）</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono">{detail}</pre>
          </details>
        )
      }
      actions={
        <>
          <button type="button" onClick={() => window.location.reload()} className={primary}>
            <RotateCw className="size-4" /> 重新整理
          </button>
          <Link to="/" reloadDocument className={secondary}>
            <Home className="size-4" /> 回首頁
          </Link>
        </>
      }
    >
      <p>重新整理通常就會好。</p>
      <p className="text-sm">
        還是不行的話，可以
        <button type="button" onClick={clearPlanAndReload} className="mx-1 font-medium text-foreground underline underline-offset-4">
          清掉這台裝置記住的條件
        </button>
        再重新開始。
      </p>
    </ErrorLayout>
  )
}
