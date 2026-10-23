import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ItineraryRequest, Proposal } from '@/api/schemas'
import { MOTION } from '@/shared/theme/motion'
import { CostPanel } from '../CostPanel'
import { RouteSketch } from '../RouteSketch'
import { Timeline } from '../Timeline'
import { PlanCardBody } from './PlanCardBody'

type Props = {
  plan: Proposal | null
  stationName: string
  request: ItineraryRequest
  onClose: () => void
  /** 關掉後焦點回到哪個按鈕（「看完整行程」） */
  returnFocus: RefObject<HTMLButtonElement | null>
}

/**
 * 方案詳情：從卡片原位展開（layoutId 共享元素轉場），關掉時縮回原卡片。
 * 打開時背景變暗、整個頁面設成 inert（點不到、Tab 也到不了），Esc／遮罩／X 都能關。
 * 時間軸照樣留在結果頁上（Q36），這裡是放大版＋路線＋花費。
 */
export function PlanDetail({ plan, stationName, request, onClose, returnFocus }: Props) {
  const closeBtn = useRef<HTMLButtonElement>(null)
  const open = plan != null

  useEffect(() => {
    if (!open) return
    const root = document.getElementById('root')
    const prevOverflow = document.body.style.overflow
    root?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const back = returnFocus.current
    return () => {
      root?.removeAttribute('inert')
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      // 關掉時卡片會重新出現；等它出現再把焦點還回去（找同一個方案的「看完整行程」）
      requestAnimationFrame(() => (back?.isConnected ? back : document.querySelector<HTMLButtonElement>('[data-testid="plan-stage"] button:not([role])'))?.focus())
    }
  }, [open, onClose, returnFocus])

  return createPortal(
    <AnimatePresence>
      {plan && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-[60] bg-[var(--zg-scrim)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MOTION.scrim}
            onClick={onClose}
            aria-hidden="true"
          />
          <div key="frame" className="pointer-events-none fixed inset-0 z-[61] flex items-end justify-center sm:items-center sm:p-6">
            <motion.div
              layoutId={`plan-${plan.rank}`}
              transition={MOTION.expand}
              role="dialog"
              aria-modal="true"
              aria-labelledby="plan-detail-title"
              className="zg-surface pointer-events-auto flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-b-none [box-shadow:var(--zg-stage-shadow)] sm:rounded-b-[var(--radius-xl)]"
            >
              <div className="flex items-start gap-3 border-b p-5 sm:p-6">
                <h2 id="plan-detail-title" className="sr-only">完整行程</h2>
                <div className="min-w-0 flex-1">
                  <PlanCardBody plan={plan} stationName={stationName} size="lg" />
                </div>
                <button ref={closeBtn} onClick={onClose} aria-label="關閉完整行程" className="grid size-10 shrink-0 place-items-center rounded-full border hover:bg-muted">
                  <X className="size-4" />
                </button>
              </div>
              {/* 內容等卡片放大到位再淡入，展開時才不會看到文字被拉扯 */}
              <motion.div
                className="grid gap-6 overflow-y-auto p-5 sm:p-6 lg:grid-cols-[1fr_20rem]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.18, duration: 0.2 } }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
              >
                <Timeline plan={plan} stationName={stationName} />
                <div className="space-y-4">
                  <RouteSketch plan={plan} />
                  <CostPanel plan={plan} budget={request.budget_per_person} />
                </div>
              </motion.div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
