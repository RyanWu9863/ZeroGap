import { MotionConfig } from 'motion/react'
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { USE_MOCK } from '@/api/client'
import { Logo } from '@/shared/brand/Logo'
import { ThemeToggle } from '@/shared/theme/ThemeToggle'
import { useApplyTheme } from '@/shared/theme/theme'
import { useDemoStore } from '@/store/demoStore'
import { BottomNav, NAV_ITEMS } from './BottomNav'
import { SiteFooter } from './SiteFooter'

/** 每一頁共用的外框：頂部導覽（電腦）＋內容＋頁尾＋底部導覽（手機） */
export function AppShell() {
  useApplyTheme()
  const { pathname } = useLocation()
  const demo = useDemoStore((s) => s.demo)
  return (
    <MotionConfig reducedMotion="user">
      {demo && (
        <div className="bg-zg-tight px-4 py-1.5 text-center text-xs font-medium text-background" role="status" style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top, 0px))' }}>
          展示模式：使用預先錄製的回應，不是即時查詢
        </div>
      )}
      <header className="sticky z-40 border-b bg-background/80 backdrop-blur-md" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link to="/" aria-label="ZeroGap 零空檔 首頁">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {USE_MOCK && (
              <span className="mr-1 hidden rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">假資料（開發用）</span>
            )}
            <nav aria-label="主要頁面" className="hidden sm:block">
              <ul className="flex items-center gap-1">
                {NAV_ITEMS.map(({ to, label, match }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      aria-current={match(pathname) ? 'page' : undefined}
                      className={`rounded-md px-3 py-2 text-sm transition-colors hover:text-foreground ${match(pathname) ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <SiteFooter />
      <BottomNav pathname={pathname} />
      <ScrollRestoration />
    </MotionConfig>
  )
}
