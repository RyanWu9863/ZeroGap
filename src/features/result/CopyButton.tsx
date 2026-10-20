import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import type { ItineraryRequest, Proposal } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { itineraryToText } from '@/shared/lib/copyText'

/** 先用新式剪貼簿；被瀏覽器擋下（LINE 內建瀏覽器、權限未開）就改用舊方法 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

/** 「複製行程」（Q27、Q61）：純前端。兩種方法都失敗時，直接把文字秀出來讓人手動複製。 */
export function CopyButton({ request, plan, className }: { request: ItineraryRequest; plan: Proposal; className?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'manual'>('idle')
  const text = itineraryToText(request, plan)
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
          <textarea readOnly value={text} rows={8} className="w-full resize-none rounded-md border bg-background p-2 font-mono text-base sm:text-[11px]" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  )
}
