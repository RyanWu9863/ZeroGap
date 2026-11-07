import { Link } from 'react-router'
import { activeNav, NAV_ITEMS } from './navItems'

/** 手機底部導覽：sm 以上隱藏；底部留出 iPhone 橫條的安全區域 */
export function BottomNav({ pathname }: { pathname: string }) {
  const current = activeNav(pathname)
  return (
    <nav
      aria-label="主要頁面（底部）"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = current === to
          return (
            <li key={to}>
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 px-3 text-xs whitespace-nowrap ${active ? 'text-primary font-medium' : 'text-muted-foreground'}`}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
