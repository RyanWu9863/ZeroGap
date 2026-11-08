import { CalendarClock, Clapperboard, TriangleAlert, UtensilsCrossed } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRequestLabels } from '@/api/labels'
import { failure, useCoverage } from '@/api/queries'
import { nearestAvailable } from '@/shared/lib/dates'
import { formatDate } from '@/shared/lib/format'
import { usePlanStore } from '@/store/planStore'
import { ChoiceCard, Field } from '../parts/Choice'
import { DateCalendar } from '../parts/DateCalendar'
import { TimeRange } from '../parts/TimeRange'
import { useDateContext } from '../useDateContext'
import { dateUsable, departureInPast, durationLabel, minutesAvailable, tooTight } from '../validation'
import { StepShell } from './StepShell'

/** ② 時間（Q47、Q48、Q49、Q70、Q97）。有場次的日子來自 /api/coverage 的 available_dates（提案 #4） */
export function StepTime() {
  const { request, setRequest } = usePlanStore()
  const coverage = useCoverage(request.area || undefined)
  const { data } = coverage
  const { station } = useRequestLabels(request)
  const dateCtx = useDateContext()
  const { today, available } = dateCtx
  const needsFix = Boolean(available) && !dateUsable(request.date, { today, available })
  // 換掉的舊日期（已經過了、或這個商圈那天沒場次），用來提示使用者（P0-1）；在畫面渲染時記下，不另外跑 effect
  const [replaced, setReplaced] = useState<string | null>(null)
  if (needsFix && request.date && replaced !== request.date) setReplaced(request.date)

  // 預設日期跟著今天走：沒選、已過期、或沒場次 → 自動換成最近可選日；一天都沒有就清掉，請使用者重選
  useEffect(() => {
    if (!needsFix || !available) return
    const next = nearestAvailable(available, today)
    if (next !== request.date) setRequest({ date: next ?? '' })
  }, [needsFix, available, today, request.date, setRequest])

  const warn = (text: string) => (
    <span className="inline-flex items-center gap-1 font-medium text-zg-tight">
      <TriangleAlert className="size-3.5" aria-hidden="true" />
      {text}
    </span>
  )
  return (
    <StepShell title="哪一天、幾點到幾點？" loading={!data} error={failure(coverage)} onRetry={() => coverage.refetch()}>
      {data && (
        <>
          <Field title="日期" hint="灰色的日子還沒有場次資料。">
            {replaced && request.date && (
              <p className="flex items-start gap-1.5 rounded-md border border-zg-tight/40 px-3 py-2 text-sm" role="status">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-zg-tight" aria-hidden="true" />
                <span>原本選的 {formatDate(replaced)} 已經過了或沒有場次，先幫你改成 {formatDate(request.date)}。</span>
              </p>
            )}
            <DateCalendar
              available={data.available_dates}
              value={request.date}
              today={dateCtx.today}
              onChange={(date) => {
                setReplaced(null)
                setRequest({ date })
              }}
            />
          </Field>
          <Field
            title={`你有 ${durationLabel(minutesAvailable(request))}`}
            hint={
              departureInPast(request)
                ? warn('今天要選現在之後的出門時間。')
                : tooTight(request)
                  ? warn('看電影＋吃飯通常需要 4 小時以上，可能排不出來（還是可以試試）。')
                  : undefined
            }
          >
            <TimeRange
              from={request.earliest_departure}
              to={request.latest_home}
              toLabel={`回到${station}`}
              onChange={(earliest_departure, latest_home) => setRequest({ earliest_departure, latest_home })}
            />
          </Field>
          <Field title="先看電影，還是先吃飯？">
            <div role="radiogroup" aria-label="吃飯順序" className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                selected={request.order === 'movie_first'}
                onClick={() => setRequest({ order: 'movie_first' })}
                icon={<span className="flex gap-1"><Clapperboard className="size-4" />→<UtensilsCrossed className="size-4" /></span>}
                title="看完再吃"
              />
              <ChoiceCard
                selected={request.order === 'meal_first'}
                onClick={() => setRequest({ order: 'meal_first' })}
                icon={<span className="flex gap-1"><UtensilsCrossed className="size-4" />→<Clapperboard className="size-4" /></span>}
                title="先吃再看"
              />
            </div>
          </Field>
        </>
      )}
    </StepShell>
  )
}
