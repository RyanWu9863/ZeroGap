import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { SCENARIOS } from '@/features/intro/scenarios'
import { resolveBenchmark } from '@/api/benchmark'
import { usePlanStore } from '@/store/planStore'
import { usePresentStore } from './presentStore'

/**
 * 簡報模式的快捷鍵（Q95）：
 *   1／2／3 → 直接用該情境卡排行程（重新規劃）；接真後端時車站 id 和日期換成真的（api/benchmark.ts）
 *   B → 系統幕後；H → 首頁
 * 字體放大 15%，投影時後排也看得到。正在輸入文字時不攔截按鍵。
 */
export function PresentMode() {
  const on = usePresentStore((s) => s.on)
  const navigate = useNavigate()
  const replaceRequest = usePlanStore((s) => s.replaceRequest)

  useEffect(() => {
    document.documentElement.toggleAttribute('data-present', on)
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, [contenteditable]')) return
      const i = ['1', '2', '3'].indexOf(e.key)
      if (i >= 0) {
        void resolveBenchmark(SCENARIOS[i].patch)
          .then((r) => {
            replaceRequest(r)
            navigate('/result', { state: { replay: true } })
          })
          .catch(() => navigate('/plan/1'))
      } else if (e.key.toLowerCase() === 'b') navigate('/behind')
      else if (e.key.toLowerCase() === 'h') navigate('/')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on, navigate, replaceRequest])

  if (!on) return null
  return (
    <div
      className="fixed right-4 z-50 hidden rounded-full border bg-popover/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow backdrop-blur lg:block"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      aria-hidden="true"
    >
      簡報模式・1–3 情境・B 幕後・H 首頁
    </div>
  )
}
