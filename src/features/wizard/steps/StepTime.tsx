import { Clapperboard, TriangleAlert, UtensilsCrossed } from 'lucide-react'
import { useOptions } from '@/api/queries'
import { stationLabel } from '@/shared/lib/format'
import { usePlanStore } from '@/store/planStore'
import { ChoiceCard, Field } from '../parts/Choice'
import { DateCalendar } from '../parts/DateCalendar'
import { TimeRange } from '../parts/TimeRange'
import { durationLabel, minutesAvailable, tooTight } from '../validation'
import { StepShell } from './StepShell'

/** ② 時間（Q47、Q48、Q49、Q70、Q97） */
export function StepTime() {
  const { request, setRequest } = usePlanStore()
  const { data } = useOptions()
  const station = request.origin_station ? stationLabel(request.origin_station) : '出發站'
  return (
    <StepShell title="哪一天、幾點到幾點？" loading={!data}>
      {data && (
        <>
          <Field title="日期" hint="灰色的日子還沒有場次資料。">
            <DateCalendar available={data.available_dates ?? []} value={request.date} onChange={(date) => setRequest({ date })} />
          </Field>
          <Field
            title={`你有 ${durationLabel(minutesAvailable(request))}`}
            hint={
              tooTight(request) ? (
                <span className="inline-flex items-center gap-1 font-medium text-zg-tight">
                  <TriangleAlert className="size-3.5" aria-hidden="true" />
                  看電影＋吃飯通常需要 4 小時以上，可能排不出來（還是可以試試）。
                </span>
              ) : undefined
            }
          >
            <TimeRange
              from={request.earliest_departure}
              to={request.latest_return}
              toLabel={`回到${station}`}
              onChange={(earliest_departure, latest_return) => setRequest({ earliest_departure, latest_return })}
            />
          </Field>
          <Field title="先看電影，還是先吃飯？">
            <div role="radiogroup" aria-label="吃飯順序" className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                selected={request.dining_order === '看完電影再吃'}
                onClick={() => setRequest({ dining_order: '看完電影再吃' })}
                icon={<span className="flex gap-1"><Clapperboard className="size-4" />→<UtensilsCrossed className="size-4" /></span>}
                title="看完再吃"
              />
              <ChoiceCard
                selected={request.dining_order === '先吃再看'}
                onClick={() => setRequest({ dining_order: '先吃再看' })}
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
