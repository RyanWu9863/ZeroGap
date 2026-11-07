import { CalendarPlus, Check, RefreshCw, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { USE_MOCK } from '@/api/client'
import type { Plan, SavedPlan } from '@/api/schemas'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { writeClipboard } from '@/shared/lib/clipboard'
import { icsFor } from '@/shared/lib/ics'
import { clock } from '@/shared/lib/time'
import { useDemoStore } from '@/store/demoStore'
import { usePlanStore } from '@/store/planStore'
import { CopyButton } from './CopyButton'
import { shareUrl } from './planPath'
import type { SwapView } from './swap'

const btn = 'h-11 w-full gap-2 sm:w-auto'

/** 結果頁的三個動作：分享連結、加到行事曆、改條件重排；下面留「複製行程」文字版 */
export function PlanActions({
  doc,
  plan,
  swapped,
  stationName,
  compact = false,
  expired = false,
  className,
}: {
  doc: SavedPlan
  plan: Plan
  swapped: SwapView | null
  stationName: string
  /** 手機底部固定列：只放「分享連結」，提醒文字不放 */
  compact?: boolean
  /** 分享頁過期了：分享連結、加到行事曆都不能按 */
  expired?: boolean
  className?: string
}) {
  const navigate = useNavigate()
  const demo = useDemoStore((s) => s.demo)
  const [share, setShare] = useState<'idle' | 'done' | 'manual'>('idle')
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(copiedTimer.current), []) // 離開頁面時不要讓計時器去改已經不在的元件
  const url = shareUrl(window.location.origin, import.meta.env.BASE_URL, doc.job_id, plan.rank)

  const onShare = async () => {
    const touch = window.matchMedia('(pointer: coarse)').matches
    if (touch && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'ZeroGap 行程', text: `電影《${plan.movie.title}》＋晚餐，${clock(plan.depart_at)} 出門`, url })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        // 分享面板打不開：先試著直接複製，連複製都不行才請使用者手動複製
      }
    }
    const ok = await writeClipboard(url)
    setShare(ok ? 'done' : 'manual')
    if (ok) {
      clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setShare('idle'), 2000)
    }
  }

  const onCalendar = () => {
    const text = icsFor({ plan, jobId: doc.job_id, request: doc.request, url, stationName, now: new Date() })
    const href = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = href
    a.download = `zerogap-${doc.request.date}-方案${plan.rank}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  const onRerun = () => {
    usePlanStore.getState().replaceRequest(doc.request)
    navigate('/plan/1')
  }

  // 手機的分享按鈕在底部固定列，這裡的那顆只在電腦版出現（不會有兩顆同名按鈕）
  const shareButton = (
    <Button onClick={onShare} disabled={expired} className={cn(btn, !compact && 'max-lg:hidden')}>
      {share === 'done' ? <Check className="size-4" /> : <Share2 className="size-4" />}
      分享連結
    </Button>
  )
  const status = (
    <p className="text-xs text-muted-foreground empty:hidden" aria-live="polite">
      {share === 'done' ? '已複製連結' : ''}
    </p>
  )
  const manual = share === 'manual' && (
    <div className="zg-surface p-3 text-xs">
      <p className="mb-2 text-muted-foreground">這個瀏覽器不讓網頁自動複製，請長按下面的網址手動複製：</p>
      <input readOnly value={url} aria-label="行程連結" className="h-10 w-full rounded-md border bg-background px-2 text-base sm:text-xs" onFocus={(e) => e.currentTarget.select()} />
    </div>
  )

  const located = doc.request.origin_lat != null
  const mockNote = USE_MOCK || demo
  // 提醒文字每個寬度只顯示一份：手機在底部固定列的分享按鈕旁，電腦在右欄（max-lg:hidden）
  const notes = (
    <>
      {expired && <p className="text-xs text-muted-foreground">行程過期了，先重排再分享。</p>}
      {located && <p className="text-xs text-muted-foreground">這個連結含有你出發的大概位置（約 100 公尺內），只傳給信任的人。</p>}
      {mockNote && <p className="text-xs text-muted-foreground">展示版：這個連結只在這台瀏覽器打得開。</p>}
    </>
  )

  if (compact) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="space-y-0.5 empty:hidden">{notes}</div>
        {shareButton}
        {status}
        {manual}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {shareButton}
        <Button variant="outline" onClick={onCalendar} disabled={expired} className={btn}>
          <CalendarPlus className="size-4" />
          加到行事曆
        </Button>
        <Button variant="outline" onClick={onRerun} className={btn}>
          <RefreshCw className="size-4" />
          改條件重排
        </Button>
      </div>
      {status}
      {manual}
      <div className="space-y-3 max-lg:hidden empty:hidden">{notes}</div>
      <CopyButton request={doc.request} plan={plan} swapped={swapped} />
    </div>
  )
}
