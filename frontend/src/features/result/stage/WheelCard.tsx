import { motion, useTransform, type MotionValue } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { wheelOffset, wheelPose, type WheelLayout } from './wheel'

/** 轉盤上的一張卡：位置、大小、角度、透明度都跟著轉盤的 rot 連續變化（拖曳時跟手） */
export function WheelCard({ index, n, rot, layout, layoutId, className, children }: { index: number; n: number; rot: MotionValue<number>; layout: WheelLayout; layoutId: string; className: string; children: ReactNode }) {
  const pose = (r: number) => wheelPose(wheelOffset(index, r, n), layout)
  const x = useTransform(rot, (r) => pose(r).x)
  const scale = useTransform(rot, (r) => pose(r).scale)
  const rotateY = useTransform(rot, (r) => pose(r).rotateY)
  const opacity = useTransform(rot, (r) => pose(r).opacity)
  const zIndex = useTransform(rot, (r) => pose(r).zIndex)
  const pointerEvents = useTransform(opacity, (o) => (o < 0.2 ? 'none' : 'auto'))
  return (
    <motion.div layoutId={layoutId} style={{ x, scale, rotateY, opacity, zIndex, pointerEvents, width: layout.card }} className={cn('[grid-area:1/1]', className)}>
      {children}
    </motion.div>
  )
}

/** 卡片下方的 ‹ › 箭頭 */
export function SpinButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full border bg-background/60 hover:bg-muted disabled:opacity-40 pointer-coarse:size-11"
    >
      {children}
    </button>
  )
}
