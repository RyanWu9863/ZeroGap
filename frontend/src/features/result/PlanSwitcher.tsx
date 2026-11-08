import type React from 'react'
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { Plan } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { bufferLevel, LEVEL_LABEL } from '@/shared/lib/buffer'
import { formatMoney } from '@/shared/lib/format'
import { clockOn } from '@/shared/lib/time'
import { desktopOrder, planBadge, planTag } from './labels'
import { planFigures, type SwapView } from './swap'

const LEVEL_TEXT = { roomy: 'text-zg-ok', snug: 'text-zg-snug', tight: 'text-zg-tight' }

/** 估計值的黃底（卡片本身是按鈕，裡面不能再放 Money 的 ⓘ 按鈕） */
const Est = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded bg-zg-est px-1 text-zg-est-ink" data-estimated="true">
    約 {children}
  </span>
)

/**
 * 三張方案摘要卡（Q20、Q64）。
 * 桌機：橫排、第一名置中稍大；手機：可左右滑，第一名在最左。點哪張，下方時間軸就換哪個。
 * 換過電影或餐廳的方案（D2），到家時間和每人花費改成備選的估計值（黃底）。
 */
export function PlanSwitcher({ plans, selected, onSelect, stationName, date, swapOf }: {
  plans: Plan[]
  selected: number
  onSelect: (rank: number) => void
  stationName: string
  date: string
  swapOf: (rank: number) => SwapView | null
}) {
  const desktop = desktopOrder(plans)
  const reduce = useReducedMotion()
  const strip = useRef<HTMLDivElement>(null)
  const refs = useRef(new Map<number, HTMLButtonElement>())
  const focusAfterKey = useRef(false)
  // 按太快時畫面還沒換完，用「已經選了」的那個當基準
  const current = useRef(selected)
  useEffect(() => {
    current.current = selected
  }, [selected])
  useEffect(() => {
    const el = refs.current.get(selected)
    if (!el) return
    // 只捲橫向那一列，不讓整頁上下跳
    const box = strip.current
    if (box && box.scrollWidth > box.clientWidth) {
      const visible = el.offsetLeft >= box.scrollLeft && el.offsetLeft + el.offsetWidth <= box.scrollLeft + box.clientWidth
      if (!visible) box.scrollTo({ left: Math.max(0, el.offsetLeft - 16), behavior: reduce ? 'auto' : 'smooth' })
    }
    if (focusAfterKey.current) {
      focusAfterKey.current = false
      el.focus()
    }
  }, [selected, reduce])
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const i = plans.findIndex((p) => p.rank === current.current)
    const next = plans[(i + step + plans.length) % plans.length]
    if (next.rank === current.current) return
    current.current = next.rank
    focusAfterKey.current = true
    onSelect(next.rank)
  }
  return (
    <div ref={strip} role="radiogroup" aria-label="選擇方案" onKeyDown={onKeyDown} className="relative -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:items-center sm:overflow-visible sm:px-0">
      {plans.map((p) => {
        const level = bufferLevel(p.min_buffer_minutes)
        const active = p.rank === selected
        const swapped = swapOf(p.rank)
        const fig = planFigures(p, swapped)
        return (
          <motion.button
            key={p.rank}
            role="radio"
            ref={(el) => {
              if (el) refs.current.set(p.rank, el)
              else refs.current.delete(p.rank)
            }}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(p.rank)}
            layout
            style={{ '--o': desktop.indexOf(p), viewTransitionName: `zg-plan-${p.rank}` } as React.CSSProperties}
            className={cn(
              'zg-surface relative w-64 shrink-0 snap-start p-4 text-left transition-[border-color,box-shadow] sm:w-auto sm:[order:var(--o)]',
              p.rank === 1 && 'sm:py-6',
              active ? 'border-foreground ring-2 ring-foreground/80' : 'hover:border-foreground/40',
            )}
          >
            <span className="flex items-center gap-2">
              <span className="text-base font-semibold">{planTag(p)}</span>
              {planBadge(p) && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">{planBadge(p)}</span>
              )}
            </span>
            <span className="zg-num mt-3 block text-xl font-semibold">
              {clockOn(p.depart_at, date)}
              <span className="mx-1.5 text-muted-foreground">→</span>
              {swapped ? <Est>{clockOn(fig.homeAt, date)}</Est> : clockOn(fig.homeAt, date)}
            </span>
            <span className="block text-xs text-muted-foreground">出門 → 回到{stationName}</span>
            <span className="mt-3 flex justify-between gap-2 text-sm">
              <span>
                每人 <span className="zg-num font-medium">{swapped ? <Est>{formatMoney(fig.total)}</Est> : formatMoney(fig.total)}</span>
              </span>
              <span className={LEVEL_TEXT[level]}>
                最緊 <span className="zg-num font-medium">{p.min_buffer_minutes}</span> 分・{LEVEL_LABEL[level]}
              </span>
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
