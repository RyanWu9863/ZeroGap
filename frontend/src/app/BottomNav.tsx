import { CalendarClock, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'

/** 導覽項目：頂部和手機底部共用。第 5 批加方法、AI 助理、關於時在這裡加 */
export const NAV_ITEMS: { to: string; label: string; icon: LucideIcon; match: (path: string) => boolean }[] = [
  { to: '/plan/1', label: '排行程', icon: CalendarClock, match: (p) => p.startsWith('/plan') || p.startsWith('/result') || p.startsWith('/p/') },
]

/** 手機底部導覽：sm 以上隱藏；底部留出 iPhone 橫條的安全區域 */
export function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="主要頁面（底部）"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {NAV_ITEMS.map(({ to, label, icon: Icon, match }) => {
          const active = match(pathname)
          return (
            <li key={to}>
              <NavLink
                to={to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 px-3 text-xs ${active ? 'text-primary font-medium' : 'text-muted-foreground'}`}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
