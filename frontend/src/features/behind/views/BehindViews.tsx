import { useRef, useState, type KeyboardEvent } from 'react'
import type { PlanRequest, PlanResult } from '@/api/schemas'
import { DecisionMatrix } from './DecisionMatrix'
import { DecisionTimeline } from './DecisionTimeline'
import { FunnelView } from './FunnelView'

const TABS = [
  { id: 'funnel', label: 'A 篩選漏斗', hint: '組合怎麼一關一關被篩掉' },
  { id: 'timeline', label: 'B 決策時間軸', hint: '系統照什麼順序做了哪些事' },
  { id: 'matrix', label: 'C 決策比較', hint: '入選的方案差在哪裡' },
] as const

type Tab = (typeof TABS)[number]['id']

/**
 * 系統幕後的三種視覺化（沉浸式新版 PR5，?exp=1）：同一份結果、同一組條件，換個角度看。
 * origin＝出發點的名稱（車站名或「目前位置」）：請求裡只有 id，由系統幕後查好傳進來。
 * 先做三版讓團隊比較可讀性，再決定正式用哪一版（使用者 10/23 的要求）。
 */
export function BehindViews({ request, result, origin }: { request: PlanRequest; result: PlanResult; origin: string }) {
  const [tab, setTab] = useState<Tab>('funnel')
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % 3] : e.key === 'ArrowLeft' ? TABS[(i + 2) % 3] : null
    if (!next) return
    e.preventDefault()
    setTab(next.id)
    refs.current[next.id]?.focus()
  }
  const current = TABS.find((t) => t.id === tab)!

  return (
    <div className="zg-surface p-5" data-testid="behind-views">
      <div role="tablist" aria-label="幕後分析的呈現方式" className="flex flex-wrap gap-2" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className="rounded-full border px-3.5 py-1.5 text-sm aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground pointer-coarse:min-h-10"
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{current.hint}・三種都用同一份結果</p>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-5">
        {tab === 'funnel' && <FunnelView request={request} result={result} origin={origin} />}
        {tab === 'timeline' && <DecisionTimeline request={request} result={result} />}
        {tab === 'matrix' && <DecisionMatrix request={request} result={result} />}
      </div>
    </div>
  )
}
