import { animate, useMotionValue, useReducedMotion, type PanInfo } from 'motion/react'
import { useCallback, useEffect, useRef, type MouseEvent, type WheelEvent } from 'react'
import type { Proposal } from '@/api/schemas'
import { MOTION } from '@/shared/theme/motion'
import { indexAt, nearestTurn } from './wheel'

/**
 * 轉盤的狀態和手勢：rot 是轉盤轉到第幾格（拖曳時有小數），target 是放手後要停的那一格。
 * 拖曳：移動一張卡的距離＝轉一格，放手時看速度決定停在哪（一次最多轉一格）。
 * 回傳的 gestures 直接接到舞台的 motion.div 上。
 */
export function useWheelSpin(ordered: Proposal[], selected: number, onSelect: (rank: number) => void, step: number) {
  const n = ordered.length
  const idx = Math.max(0, ordered.findIndex((p) => p.rank === selected))
  const reduce = useReducedMotion()
  const rot = useMotionValue(idx)
  const target = useRef(idx)

  const spinTo = useCallback(
    (k: number) => {
      target.current = k
      if (reduce) rot.set(k)
      else animate(rot, k, MOTION.move)
    },
    [reduce, rot],
  )

  /** 轉到第 k 格（兩個方案以下不繞圈）；回傳選中的方案有沒有換 */
  const go = (k: number) => {
    const to = n < 3 ? Math.max(0, Math.min(n - 1, k)) : k
    spinTo(to)
    const rank = ordered[indexAt(to, n)].rank
    if (rank !== selected) onSelect(rank)
    return rank !== selected
  }

  // 從外面換方案（網址、上一頁）時，轉盤走最短的方向轉過去
  useEffect(() => {
    if (indexAt(target.current, n) !== idx) spinTo(nearestTurn(rot.get(), idx, n))
  }, [idx, n, rot, spinTo])

  const dragFrom = useRef(0)
  const dragged = useRef(false)
  const wheelAcc = useRef({ sum: 0, until: 0 })
  const spinnable = n > 1

  const gestures = {
    onPointerDownCapture: () => (dragged.current = false),
    onClickCapture: (e: MouseEvent) => {
      if (!dragged.current) return
      e.stopPropagation() // 剛拖完放手的那一下不算點擊
      dragged.current = false
    },
    onPanStart: () => {
      if (!spinnable) return
      dragged.current = true
      rot.stop()
      dragFrom.current = rot.get()
    },
    onPan: (_: unknown, info: PanInfo) => {
      if (!spinnable) return
      const r = dragFrom.current - info.offset.x / step
      rot.set(n < 3 ? Math.max(-0.3, Math.min(n - 0.7, r)) : r)
    },
    onPanEnd: (_: unknown, info: PanInfo) => {
      if (!spinnable) return
      const from = Math.round(dragFrom.current)
      const flung = Math.round(rot.get() - (info.velocity.x / step) * 0.15)
      go(Math.max(from - 1, Math.min(from + 1, flung)))
    },
    onWheel: (e: WheelEvent) => {
      // 觸控板左右滑：累積夠了轉一格，然後稍等一下，免得一次滑過頭
      if (!spinnable || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      const w = wheelAcc.current
      if (e.timeStamp < w.until) return
      w.sum += e.deltaX
      if (Math.abs(w.sum) < 40) return
      go(target.current + Math.sign(w.sum))
      w.sum = 0
      w.until = e.timeStamp + 450
    },
  }

  return { idx, rot, target, go, spinnable, gestures }
}
