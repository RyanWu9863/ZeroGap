import { BookOpen, Bot, CalendarClock, Info, type LucideIcon } from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; match: (path: string) => boolean }

const page = (p: string) => (path: string) => path === p || path.startsWith(`${p}/`)

/** 導覽項目（規格 3.1）：頂部（電腦）和底部（手機）共用；/behind 故意不列 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/plan/1', label: '排行程', icon: CalendarClock, match: (p) => p.startsWith('/plan') || p.startsWith('/result') || p.startsWith('/p/') },
  { to: '/method', label: '方法', icon: BookOpen, match: page('/method') },
  { to: '/ai', label: 'AI 助理', icon: Bot, match: page('/ai') },
  { to: '/about', label: '關於', icon: Info, match: page('/about') },
]

export function activeNav(path: string): string | null {
  return NAV_ITEMS.find((n) => n.match(path))?.to ?? null
}
