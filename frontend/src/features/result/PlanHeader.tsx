import { ArrowRight, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import type { SavedPlan } from '@/api/schemas'
import { Button } from '@/components/ui/button'
import { stamp } from '@/shared/lib/time'
import { USE_MOCK } from '@/api/client'
import { useDemoStore } from '@/store/demoStore'

/** 一行說明排好的時間；過期了多一條橫幅，可以用同樣條件重排（行程照樣顯示） */
export function PlanHeader({ doc, expired, onRerun }: { doc: SavedPlan; expired: boolean; onRerun: () => void }) {
  return (
    <div className="mt-6 space-y-3">
      <p className="text-sm text-muted-foreground">
        這份行程在 <span className="zg-num">{stamp(doc.created_at)}</span> 排好，班次已確認。
      </p>
      {expired && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zg-est px-4 py-3 text-sm text-zg-est-ink">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">這份行程已經過期</p>
              <p>每個方案的出發時間都過了，或是超過 7 天。下面還看得到當初排的內容，要出門請重排。</p>
            </div>
          </div>
          <Button onClick={onRerun} className="h-11">
            用同樣條件重排
          </Button>
        </div>
      )}
    </div>
  )
}

/** 找不到這份行程：網址亂打、沒排過，或超過 7 天 */
export function PlanMissing() {
  const demo = useDemoStore((s) => s.demo)
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">找不到這份行程，可能已經超過 7 天</h1>
      <p className="mt-2 text-sm text-muted-foreground">分享連結保留 7 天。可以用自己的條件重新排一次。</p>
      {(USE_MOCK || demo) && <p className="mt-2 text-sm text-muted-foreground">展示版的連結只在排行程的那台瀏覽器打得開。</p>}
      <Link to="/" className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg border px-5 text-sm hover:bg-muted">
        回首頁排行程 <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}
