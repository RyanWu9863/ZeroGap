import { Maximize2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Plan } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'
import { MOTION } from '@/shared/theme/motion'
import type { Swap, SwapView } from '../swap'
import { PlanCardBody } from './PlanCardBody'
import { PlanDetail } from './PlanDetail'

type Slot = 'left' | 'center' | 'right'
/** 側邊卡片往外推多少（卡片寬的百分比）；平板比較窄，推少一點，免得超出畫面 */
const slots = (push: number) => ({
  left: { x: `-${push}%`, y: 18, scale: 0.84, opacity: 1, zIndex: 1 },
  center: { x: '0%', y: 0, scale: 1, opacity: 1, zIndex: 3 },
  right: { x: `${push}%`, y: 18, scale: 0.84, opacity: 1, zIndex: 1 },
})

type Props = {
  plans: Plan[]
  selected: number
  onSelect: (rank: number) => void
  stationName: string
  date: string
  budget: number
  /** 換過電影或餐廳的方案（D2）：到家時間和每人花費用估計值 */
  swapOf: (rank: number) => SwapView | null
  /** 每個方案目前換了什麼、怎麼換（詳情裡的時間軸也能換一部／換一家，跟結果頁同一份狀態） */
  swapOn: (rank: number) => Swap | null
  onSwap: (rank: number, s: Swap | null) => void
}

/**
 * 沉浸式新版的三方案舞台（?exp=1，取代 PlanSwitcher；Q20：第一名預設置中、稍大）。
 * 桌機：選中的方案在中央放大，另外兩個縮小退到左右；點側邊或按 ←／→ 換到中央。
 * 手機：可左右滑的單張大卡（Q64）。「看完整行程」從卡片原位展開成詳情（共享元素轉場）。
 */
export function PlanStage({ plans, selected, onSelect, stationName, date, budget, swapOf, swapOn, onSwap }: Props) {
  const wide = useMediaQuery('(min-width: 768px)')
  const SLOT = slots(useMediaQuery('(min-width: 1024px)') ? 74 : 58)
  const [detail, setDetail] = useState<number | null>(null)
  const radios = useRef(new Map<number, HTMLButtonElement>())
  const opener = useRef<HTMLButtonElement | null>(null)
  const keyMoved = useRef(false)
  const others = plans.filter((p) => p.rank !== selected).sort((a, b) => a.rank - b.rank)
  const slotOf = (rank: number): Slot => (rank === selected ? 'center' : rank === others[0]?.rank ? 'left' : 'right')

  // 用方向鍵換方案時，焦點跟著到新的中央卡（單選群組的標準操作）
  useEffect(() => {
    if (!keyMoved.current) return
    keyMoved.current = false
    radios.current.get(selected)?.focus()
  }, [selected])

  const onKey = (e: KeyboardEvent) => {
    const ordered = wide ? [others[0], plans.find((p) => p.rank === selected), others[1]] : [...plans].sort((a, b) => a.rank - b.rank)
    const i = ordered.findIndex((p) => p?.rank === selected)
    const next = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? ordered[i - 1] : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? ordered[i + 1] : undefined
    if (!next) return
    e.preventDefault()
    keyMoved.current = true
    onSelect(next.rank)
  }

  const card = (p: Plan) => {
    const active = p.rank === selected
    return (
      <>
        <button
          ref={(el) => { if (el) radios.current.set(p.rank, el); else radios.current.delete(p.rank) }}
          role="radio"
          aria-checked={active}
          tabIndex={active ? 0 : -1}
          onClick={() => onSelect(p.rank)}
          onKeyDown={onKey}
          className="block w-full rounded-[inherit] p-5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <PlanCardBody plan={p} stationName={stationName} date={date} swapped={swapOf(p.rank)} />
        </button>
        {active && (
          <button
            onClick={(e) => { opener.current = e.currentTarget; setDetail(p.rank) }}
            className="mx-5 mb-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground pointer-coarse:min-h-11"
          >
            <Maximize2 className="size-3.5" aria-hidden="true" /> 看完整行程
          </button>
        )}
      </>
    )
  }

  const shell = (p: Plan) => cn('zg-surface', p.rank === selected ? 'ring-2 ring-primary [box-shadow:var(--zg-stage-shadow)]' : 'hover:opacity-90')

  return (
    <>
      {wide ? (
        <div role="radiogroup" aria-label="選擇方案" className="relative mx-auto h-[23rem] max-w-5xl overflow-x-clip" data-testid="plan-stage">
          {plans.map((p) => {
            const slot = SLOT[slotOf(p.rank)]
            if (detail === p.rank) return null // 展開成詳情時，卡片本身「飛」到詳情的位置
            return (
              <motion.div
                key={p.rank}
                layoutId={`plan-${p.rank}`}
                initial={false}
                animate={{ x: slot.x, y: slot.y, scale: slot.scale, opacity: slot.opacity }}
                transition={MOTION.move}
                style={{ zIndex: slot.zIndex }}
                className={cn('absolute top-0 left-1/2 ml-[calc(min(28rem,50%)/-2)] w-[min(28rem,50%)]', shell(p))}
              >
                {card(p)}
              </motion.div>
            )
          })}
        </div>
      ) : (
        <div role="radiogroup" aria-label="選擇方案" className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3" data-testid="plan-stage">
          {[...plans].sort((a, b) => a.rank - b.rank).map((p) =>
            detail === p.rank ? (
              <div key={p.rank} className="w-[85%] shrink-0" />
            ) : (
              <motion.div key={p.rank} layoutId={`plan-${p.rank}`} className={cn('w-[85%] shrink-0 snap-start', shell(p))}>
                {card(p)}
              </motion.div>
            ),
          )}
        </div>
      )}
      <PlanDetail
        plan={plans.find((p) => p.rank === detail) ?? null}
        stationName={stationName}
        date={date}
        budget={budget}
        swapped={detail == null ? null : swapOf(detail)}
        swap={detail == null ? null : swapOn(detail)}
        onSwap={(sw) => detail != null && onSwap(detail, sw)}
        onClose={() => setDetail(null)}
        returnFocus={opener}
      />
    </>
  )
}
