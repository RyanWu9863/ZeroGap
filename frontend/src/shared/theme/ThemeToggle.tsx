import { Moon, MonitorSmartphone, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { nextPref, THEME_LABEL, useThemeStore } from './theme'

const ICON = { system: MonitorSmartphone, night: Moon, day: Sun } as const

/** 右上角的外觀按鈕：跟著手機 → 夜 → 日，依序切換 */
export function ThemeToggle() {
  const pref = useThemeStore((s) => s.pref)
  const setPref = useThemeStore((s) => s.setPref)
  const Icon = ICON[pref]
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      onClick={() => setPref(nextPref(pref))}
      aria-label={`外觀：${THEME_LABEL[pref]}，按一下換成${THEME_LABEL[nextPref(pref)]}`}
      title={`外觀：${THEME_LABEL[pref]}`}
    >
      <Icon aria-hidden />
    </Button>
  )
}
