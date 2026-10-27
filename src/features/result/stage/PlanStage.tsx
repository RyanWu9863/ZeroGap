import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ItineraryRequest, Proposal } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { PlanCardBody } from './PlanCardBody'
import { PlanDetail } from './PlanDetail'
import { nearestTurn, wheelLayout } from './wheel'
import { useWheelSpin } from './useWheelSpin'
import { SpinButton, WheelCard } from './WheelCard'

type Props = { plans: Proposal[]; selected: number; onSelect: (rank: number) => void; stationName: string; request: ItineraryRequest }

/**
 * 沉浸式新版的三方案輪盤（?exp=1，取代 PlanSwitcher；Q20：第一名預設置中）。
 * 方案排在一個會轉的轉盤上：拖曳（滑鼠）、左右滑（手機）、←／→、觸控板左右滑、點側邊卡或下方箭頭都能轉，
 * 轉到底會繞回第一個。桌機三張並排、互不重疊；平板和手機只放一張，左右露一條邊（幾何見 wheel.ts）。
 * 「看完整行程」從卡片原位展開成詳情（共享元素轉場）。
 */
export function PlanStage({ plans, selected, onSelect, stationName, request }: Props) {
  const ordered = useMemo(() => [...plans].sort((a, b) => a.rank - b.rank), [plans])
  const n = ordered.length
  const [detail, setDetail] = useState<number | null>(null)
  const radios = useRef(new Map<number, HTMLButtonElement>())
  const opener = useRef<HTMLButtonElement | null>(null)
  const keyMoved = useRef(false)

  // 舞台寬度決定排法（三張並排或一張＋露邊）
  const stageRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const layout = wheelLayout(width || 390)
  const { idx, rot, target, go, spinnable, gestures } = useWheelSpin(ordered, selected, onSelect, layout.step)

  // 用方向鍵換方案時，焦點跟著到新的中央卡（單選群組的標準操作）
  useEffect(() => {
    if (!keyMoved.current) return
    keyMoved.current = false
    radios.current.get(selected)?.focus()
  }, [selected])

  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
    if (!dir) return
    e.preventDefault()
    if (go(target.current + dir)) keyMoved.current = true
  }

  const card = (p: Proposal) => {
    const active = p.rank === selected
    return (
      <>
        <button
          ref={(el) => { if (el) radios.current.set(p.rank, el); else radios.current.delete(p.rank) }}
          role="radio"
          aria-checked={active}
          tabIndex={active ? 0 : -1}
          onClick={() => !active && go(nearestTurn(target.current, ordered.indexOf(p), n))}
          onKeyDown={onKey}
          className="block w-full rounded-[inherit] p-5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <PlanCardBody plan={p} stationName={stationName} />
        </button>
        {active && (
          <button
            data-plan-open
            onClick={(e) => { opener.current = e.currentTarget; setDetail(p.rank) }}
            className="mx-5 mb-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground pointer-coarse:min-h-11"
          >
            <Maximize2 className="size-3.5" aria-hidden="true" /> 看完整行程
          </button>
        )}
      </>
    )
  }

  const shell = (p: Proposal) => cn('zg-surface', p.rank === selected ? 'ring-2 ring-primary [box-shadow:var(--zg-stage-shadow)]' : 'cursor-pointer')

  return (
    <div className="-mx-4 sm:-mx-6">
      <motion.div
        ref={stageRef}
        role="radiogroup"
        aria-label="選擇方案"
        data-testid="plan-stage"
        data-layout={layout.mode}
        className={cn('relative grid place-items-center overflow-x-clip overscroll-x-contain py-4 [perspective:1600px] select-none', spinnable && 'cursor-grab active:cursor-grabbing', layout.mode === 'peek' && '[mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]')}
        style={{ touchAction: 'pan-y' }}
        {...gestures}
      >
        {ordered.map((p, i) =>
          detail === p.rank ? (
            // 展開成詳情時，卡片本身「飛」到詳情的位置；這裡留一個隱形的同尺寸佔位，舞台高度才不會跳
            <div key={p.rank} aria-hidden="true" className="invisible [grid-area:1/1]" style={{ width: layout.card }}>
              <div className="p-5"><PlanCardBody plan={p} stationName={stationName} /></div>
            </div>
          ) : (
            <WheelCard key={p.rank} index={i} n={n} rot={rot} layout={layout} layoutId={`plan-${p.rank}`} className={shell(p)}>
              {card(p)}
            </WheelCard>
          ),
        )}
      </motion.div>
      {spinnable && (
        <div className="mt-1 flex items-center justify-center gap-3 px-4">
          <SpinButton label="上一個方案" disabled={n < 3 && idx === 0} onClick={() => go(target.current - 1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </SpinButton>
          <span className="flex items-center gap-1.5" aria-hidden="true">
            {ordered.map((p, i) => (
              <span key={p.rank} className={cn('h-1.5 rounded-full transition-all duration-200', i === idx ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/40')} />
            ))}
          </span>
          <SpinButton label="下一個方案" disabled={n < 3 && idx === n - 1} onClick={() => go(target.current + 1)}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </SpinButton>
          <span className="sr-only">也可以左右拖曳、滑動，或用方向鍵換方案</span>
          <span className="hidden text-xs text-muted-foreground sm:inline" aria-hidden="true">
            <span className="pointer-coarse:hidden">拖曳或按 ← → 轉動</span>
            <span className="hidden pointer-coarse:inline">左右滑動轉動</span>
          </span>
        </div>
      )}
      <PlanDetail
        plan={plans.find((p) => p.rank === detail) ?? null}
        stationName={stationName}
        request={request}
        onClose={() => setDetail(null)}
        returnFocus={opener}
      />
    </div>
  )
}
