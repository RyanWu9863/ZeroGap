import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCost } from '@/shared/lib/format'

/**
 * 金額。估計值＝黃底＋「約」＋ⓘ 說明（決策 Q24，驗收 A8）。
 * 說明用 hover／鍵盤聚焦都能看到。
 */
export function Money({ amount, estimated, className }: { amount: number; estimated: boolean; className?: string }) {
  if (!estimated) return <span className={cn('zg-num', className)}>{formatCost(amount, false)}</span>
  return (
    <span className={cn('group relative inline-flex items-center gap-1 rounded bg-zg-est px-1.5 text-zg-est-ink', className)} data-estimated="true">
      <span className="zg-num">{formatCost(amount, true)}</span>
      <button type="button" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="這是估計值">
        <Info className="size-3.5" aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-44 -translate-x-1/2 rounded-md bg-popover p-2 text-xs text-popover-foreground opacity-0 shadow-lg ring-1 ring-border transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        此價格為估計，實際以現場為準
      </span>
    </span>
  )
}
