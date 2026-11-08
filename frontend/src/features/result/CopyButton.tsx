import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useRequestLabels } from '@/api/labels'
import type { Plan, PlanRequest } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { writeClipboard } from '@/shared/lib/clipboard'
import { itineraryToText } from '@/shared/lib/copyText'
import type { SwapView } from './swap'

/** 「複製行程」（Q27、Q61）：純前端。兩種方法都失敗時，直接把文字秀出來讓人手動複製。 */
export function CopyButton({ request, plan, swapped, className }: { request: PlanRequest; plan: Plan; swapped: SwapView | null; className?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'manual'>('idle')
  const labels = useRequestLabels(request)
  const text = itineraryToText(request, plan, labels, swapped)
  const copy = async () => {
    const ok = await writeClipboard(text)
    setState(ok ? 'done' : 'manual')
    if (ok) setTimeout(() => setState('idle'), 2000)
  }
  return (
    <div className={cn('space-y-2', className)}>
      <button
        onClick={copy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        {state === 'done' ? <Check className="size-4" /> : <Copy className="size-4" />}
        <span aria-live="polite">{state === 'done' ? '已複製，可以貼到 LINE' : '複製行程'}</span>
      </button>
      {state === 'manual' && (
        <div className="zg-surface p-3 text-xs">
          <p className="mb-2 text-muted-foreground">這個瀏覽器不讓網頁自動複製，請長按下面的文字手動複製：</p>
          <textarea readOnly value={text} rows={8} className="w-full resize-none rounded-md border bg-background p-2 font-mono text-base sm:text-[11px] pointer-coarse:text-base" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  )
}
