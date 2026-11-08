import { CalendarClock, Clapperboard, TriangleAlert, UtensilsCrossed } from 'lucide-react'
import { useRequestLabels } from '@/api/labels'
import { failure, useCoverage } from '@/api/queries'
import { usePlanStore } from '@/store/planStore'
import { ChoiceCard, Field } from '../parts/Choice'
import { DateCalendar } from '../parts/DateCalendar'
import { TimeRange } from '../parts/TimeRange'
import { useDateAutoFix } from '../useDateAutoFix'
import { useDateContext } from '../useDateContext'
import { departureInPast, durationLabel, minutesAvailable, tooTight } from '../validation'
import { StepShell } from './StepShell'

/** ② 時間（Q47、Q48、Q49、Q70、Q97）。有場次的日子來自 /api/coverage 的 available_dates（提案 #4） */
export function StepTime() {
  const { request, setRequest } = usePlanStore()
  const coverage = useCoverage(request.area || undefined)
  const { data } = coverage
  const { station } = useRequestLabels(request)
  const dateCtx = useDateContext()
  // 日期不能用、或今天的出發時間已過 → 自動換成最近可以排的日子並說明（跟首頁同一條規則）
  const { notice, pickDate, touch } = useDateAutoFix(dateCtx)

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
            {notice && (
              <p className="flex items-start gap-1.5 rounded-md border border-zg-tight/40 px-3 py-2 text-sm" role="status">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-zg-tight" aria-hidden="true" />
                <span>{notice}</span>
              </p>
            )}
            <DateCalendar
              available={data.available_dates}
              value={request.date}
              today={dateCtx.today}
              onChange={pickDate}
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
              onChange={(earliest_departure, latest_home) => {
                if (earliest_departure !== request.earliest_departure) touch()
                setRequest({ earliest_departure, latest_home })
              }}
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
