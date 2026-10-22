import { Info } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatCost } from '@/shared/lib/format'

/**
 * 金額。估計值＝黃底＋「約」＋ⓘ 說明（決策 Q24，驗收 A8）。
 * ⓘ 是「點一下打開、再點一下關掉」：iPhone 點按鈕不會觸發聚焦，只靠滑鼠移上去或聚焦的話手機上看不到。
 * 說明沒打開時完全不佔版面，避免把手機畫面撐寬。
 */
export function Money({ amount, estimated, className }: { amount: number; estimated: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  if (!estimated) return <span className={cn('zg-num', className)}>{formatCost(amount, false)}</span>
  return (
    <span className={cn('relative inline-flex items-center gap-1 rounded bg-zg-est px-1.5 text-zg-est-ink', className)} data-estimated="true">
      <span className="zg-num">{formatCost(amount, true)}</span>
      <button
        type="button"
        className="-m-1.5 rounded-full p-1.5 outline-none pointer-coarse:-m-2.5 pointer-coarse:p-2.5 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="這是估計值，點一下看說明"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </button>
      {open && (
        <span role="tooltip" className="absolute bottom-full right-0 z-20 mb-2 w-44 rounded-md bg-popover p-2 text-xs text-popover-foreground shadow-lg ring-1 ring-border">
          此價格為估計，實際以現場為準
        </span>
      )}
    </span>
  )
}
