import { useEffect, useState } from 'react'
import { dateIssue, quickDate } from '@/features/home/quickPlan'
import { formatDate } from '@/shared/lib/format'
import { usePlanStore } from '@/store/planStore'
import type { DateContext } from './validation'

type Replaced = { issue: 'past-departure' | 'unusable'; from: string; departure: string }

/**
 * 日期自動修正（首頁四格、精靈第 2 步共用，同一條規則）：
 * - 日期不能用（沒填、已過、那天沒場次）→ 一律換成最近可以排的日子
 * - 今天的出發時間已過 → 換到之後最近的日子；但使用者自己在這個畫面選了日期或改了時間，就不再換（不跟使用者搶）
 * 換掉時回傳一句說明；使用者自己選日期就收起來。
 */
export function useDateAutoFix(ctx: DateContext & { today: string }) {
  const request = usePlanStore((s) => s.request)
  const setRequest = usePlanStore((s) => s.setRequest)
  const [touched, setTouched] = useState(false)
  const [replaced, setReplaced] = useState<Replaced | null>(null)

  const issue = ctx.available ? dateIssue(request, ctx) : null
  const fix = issue === 'unusable' || (issue === 'past-departure' && !touched)
  const next = fix ? quickDate(request.date, ctx, request.earliest_departure) : request.date
  // 換掉之前先記下原因（在畫面渲染時記，不另外跑 effect）
  if (issue && fix && request.date && next !== request.date && replaced?.from !== request.date) {
    setReplaced({ issue, from: request.date, departure: request.earliest_departure })
  }
  useEffect(() => {
    if (next !== request.date) setRequest({ date: next })
  }, [next, request.date, setRequest])

  const notice =
    replaced && request.date
      ? replaced.issue === 'past-departure'
        ? `今天 ${replaced.departure} 已經過了，換成最近可以排的 ${formatDate(request.date)}`
        : `原本的日期沒有場次，換成最近可以排的 ${formatDate(request.date)}`
      : null

  return {
    notice,
    /** 這次畫面算出來要換日期、還沒換好（下一次畫面才會是新日期） */
    pending: next !== request.date,
    /** 使用者自己選了日期 */
    pickDate: (date: string) => {
      setTouched(true)
      setReplaced(null)
      setRequest({ date })
    },
    /** 使用者自己改了出發時間 */
    touch: () => setTouched(true),
  }
}
