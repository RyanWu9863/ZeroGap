import { MotionConfig } from 'motion/react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { USE_MOCK } from '@/api/client'
import { Logo } from '@/shared/brand/Logo'
import { LightTrails } from '@/shared/theme/LightTrails'
import { LinearBackdrop } from '@/shared/theme/LinearBackdrop'
import { useApplyProto } from '@/shared/theme/proto'
import { useDemoStore } from '@/store/demoStore'
import { ProtoSwitcher } from './ProtoSwitcher'

const navCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm transition-colors hover:text-foreground ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`

/** 每一頁共用的外框：導覽列（Q15b）＋內容＋頁尾。 */
export function AppShell() {
  const proto = useApplyProto()
  const { pathname } = useLocation()
  const demo = useDemoStore((s) => s.demo)
  return (
    <MotionConfig reducedMotion="user">
      {proto === 'cinematic' && <LightTrails dim={pathname !== '/'} />}
      {proto === 'linear' && <LinearBackdrop />}
      {demo && (
        <div className="bg-zg-tight px-4 py-1.5 text-center text-xs font-medium text-background" role="status" style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top, 0px))' }}>
          展示模式：使用預先錄製的回應，不是即時查詢（可在「系統幕後」關閉）
        </div>
      )}
      <header
        className="sticky z-40 border-b bg-background/80 backdrop-blur-md"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="ZeroGap 零空檔 首頁">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {USE_MOCK && (
              <span className="mr-2 hidden rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">
                假資料（開發用）
              </span>
            )}
            <NavLink to="/plan/1" className={navCls}>
              開始規劃
            </NavLink>
            <NavLink to="/behind" className={navCls}>
              系統幕後
            </NavLink>
          </div>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-24 pt-16 text-xs text-muted-foreground sm:px-6">
        ZeroGap 零空檔・資策會 AIAE1 第一組專題・時間與金額由確定性演算法計算
      </footer>
      <ProtoSwitcher />
      <ScrollRestoration />
    </MotionConfig>
  )
}
