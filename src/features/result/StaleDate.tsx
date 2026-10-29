import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useCoverage } from '@/api/queries'
import type { PlanRequest } from '@/api/schemas'
import { nearestAvailable } from '@/shared/lib/dates'
import { formatDate } from '@/shared/lib/format'

/**
 * 日期已經過了（計畫 P0-1）：舊的分享網址、舊的瀏覽器暫存都可能帶著過去的日期。
 * 不靜靜地照算，先說清楚，再給一鍵換成最近可選日。
 */
export function StaleDate({ request, today, onFix }: {
  request: PlanRequest
  today: string
  onFix: (patch: Partial<PlanRequest>) => void
}) {
  // 這個商圈最近一個有場次的日子（/api/coverage）
  const { data } = useCoverage(request.area || undefined)
  const next = data ? nearestAvailable(data.available_dates, today) : null
  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <h1 className="text-2xl font-bold cine:font-semibold lin:font-semibold">這組行程的日期已經過了</h1>
      <p className="mt-3 text-muted-foreground">
        條件裡的日期是 <span className="zg-num font-medium text-zg-fail">{formatDate(request.date)}</span>，換一天再幫你排。
      </p>
      {next && (
        <button
          onClick={() => onFix({ date: next })}
          className="zg-surface mt-8 flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:border-foreground/40"
        >
          <span>
            <span className="block font-medium">改成 {formatDate(next)}，其他條件不變</span>
            <span className="text-xs text-muted-foreground">最近一個有場次的日子</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium">
            重新排 <ArrowRight className="size-4" />
          </span>
        </button>
      )}
      <Link to="/plan/2" className="mt-8 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        或回去自己選日期
      </Link>
    </div>
  )
}
