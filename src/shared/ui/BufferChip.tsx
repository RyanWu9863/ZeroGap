import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bufferLevel, LEVEL_LABEL, type BufferLevel } from '@/shared/lib/buffer'

const LEVEL_CLS: Record<BufferLevel, string> = {
  roomy: 'bg-zg-ok-soft text-zg-ok',
  snug: 'bg-zg-snug-soft text-zg-snug',
  tight: 'bg-zg-tight-soft text-zg-tight',
}

/**
 * 緩衝標籤：「✓ 開演前還有 10 分・剛好」。
 * 顏色分三級（Q40），但一定同時有文字，色弱也看得懂（Q88）。
 */
export function BufferChip({ minutes, text, className }: { minutes: number; text: string; className?: string }) {
  const level = bufferLevel(minutes)
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', LEVEL_CLS[level], className)}>
      <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
      <span>{text}</span>
      <span className="opacity-70">・{LEVEL_LABEL[level]}</span>
    </span>
  )
}
