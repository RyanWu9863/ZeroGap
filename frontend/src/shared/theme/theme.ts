import { useEffect, useSyncExternalStore } from 'react'
import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { keepAsIs, pickValid, STORAGE_VERSION } from '@/store/persistSafe'

/*
 * 外觀（規格 4.1）：「夜」是錶盤夜（深色，跟簡報同一套），「日」是同一套語言的亮色版。
 * 預設跟著手機的深淺色設定；按右上角的按鈕可以手動指定，記在瀏覽器（zg-theme）。
 * index.html 開頁前有一小段程式先套上，避免深色模式的人先看到一閃白畫面。
 */
export type ThemePref = 'system' | 'night' | 'day'
export type Theme = 'night' | 'day'

export const THEME_PREFS: ThemePref[] = ['system', 'night', 'day']
export const THEME_LABEL: Record<ThemePref, string> = { system: '跟著手機', night: '夜', day: '日' }

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === 'system') return systemDark ? 'night' : 'day'
  return pref
}

export function nextPref(pref: ThemePref): ThemePref {
  return THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length]
}

export const useThemeStore = create<{ pref: ThemePref; setPref: (p: ThemePref) => void }>()(
  persist((set) => ({ pref: 'system', setPref: (pref) => set({ pref }) }), {
    name: 'zg-theme',
    version: STORAGE_VERSION,
    migrate: keepAsIs,
    merge: (persisted, current) => ({
      ...current,
      ...pickValid<{ pref: ThemePref }>(persisted, { pref: z.enum(['system', 'night', 'day']) }),
    }),
  }),
)

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')
const subscribe = (onChange: () => void) => {
  const q = darkQuery()
  q.addEventListener('change', onChange)
  return () => q.removeEventListener('change', onChange)
}
/** 手機現在是不是深色模式；使用者在系統設定切換時會即時更新 */
export const useSystemDark = () => useSyncExternalStore(subscribe, () => darkQuery().matches, () => true)

/** 把外觀寫到 <html>：data-theme 給 CSS 用、.dark 給 shadcn 的 dark: 變體用 */
export function useApplyTheme(): Theme {
  const pref = useThemeStore((s) => s.pref)
  const theme = resolveTheme(pref, useSystemDark())
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.classList.toggle('dark', theme === 'night')
    root.style.colorScheme = theme === 'night' ? 'dark' : 'light'
    const bg = getComputedStyle(root).getPropertyValue('--background').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  }, [theme])
  return theme
}
