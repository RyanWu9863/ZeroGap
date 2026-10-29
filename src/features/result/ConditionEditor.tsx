import { useState } from 'react'
import { useRequestLabels } from '@/api/labels'
import { failure, useAreas, useCategories, useCoverage, useStations } from '@/api/queries'
import type { PlanRequest } from '@/api/schemas'
import { BUDGET_OPTIONS, WALK_OPTIONS } from '@/shared/lib/config'
import { todayISO } from '@/shared/lib/dates'
import { formatMoney, walkDistance } from '@/shared/lib/format'
import { LoadError } from '@/shared/ui/LoadError'
import { Chips, Field } from '@/features/wizard/parts/Choice'
import { DateCalendar } from '@/features/wizard/parts/DateCalendar'
import { LocationButton } from '@/features/wizard/parts/LocationButton'
import { StationPicker } from '@/features/wizard/parts/StationPicker'
import { atStation } from '@/shared/lib/origin'
import { TimeRange } from '@/features/wizard/parts/TimeRange'

export type ConditionKind = 'place' | 'date' | 'time' | 'order' | 'movie' | 'food' | 'budget' | 'walk'

type Props = { kind: ConditionKind; value: PlanRequest; onChange: (patch: Partial<PlanRequest>) => void }

/** 換了商圈或日期，原本指定的電影、片型、影廳、語言不一定還有場次 → 一起改回「幫我挑」「不限」 */
const RESET_MOVIE: Partial<PlanRequest> = { movie_id: null, movie_genre: null, hall_type: null, language: null }

const Loading = () => <p className="py-6 text-center text-muted-foreground">載入中…</p>

/**
 * 小視窗裡的編輯器（Q58）：直接重用精靈的元件，操作方式跟精靈一模一樣。
 * 選項來自 /api/areas、/api/stations、/api/coverage、/api/categories（規格書 6.2）。
 */
export function ConditionEditor({ kind, value: r, onChange }: Props) {
  const areasQ = useAreas()
  const stationsQ = useStations()
  const cuisinesQ = useCategories('cuisine')
  const daysQ = useCoverage(r.area || undefined)
  const dayQ = useCoverage(r.area || undefined, r.date || undefined)
  const [areas, stations, cuisines, days, day] = [areasQ.data, stationsQ.data, cuisinesQ.data, daysQ.data, dayQ.data]
  const [today] = useState(todayISO)
  const { station } = useRequestLabels(r)
  const any = { value: null, label: '不限' }

  // 這個條件要用的清單載入失敗了 → 白話＋重試（計畫 P1-1）
  const needs = { place: [areasQ, stationsQ], date: [daysQ], movie: [dayQ], food: [cuisinesQ] } as const
  const used = kind in needs ? needs[kind as keyof typeof needs] : []
  const failed = used.map(failure).find(Boolean)
  if (failed) return <LoadError error={failed} onRetry={() => used.forEach((q) => void q.refetch())} compact />

  switch (kind) {
    case 'place':
      if (!areas || !stations) return <Loading />
      return (
        <div className="space-y-4">
          <Field title="商圈">
            <Chips label="商圈" value={r.area} onChange={(area) => onChange({ area, ...RESET_MOVIE })} options={areas.map((a) => ({ value: a.code, label: a.name }))} />
          </Field>
          <Field title="從哪裡出發">
            <div className="space-y-3">
              <LocationButton request={r} onChange={onChange} />
              <StationPicker stations={stations} value={r.origin_station_id ?? 0} onChange={(id) => onChange(atStation(id))} />
            </div>
          </Field>
        </div>
      )
    case 'date':
      if (!days) return <Loading />
      return <DateCalendar available={days.available_dates} value={r.date} today={today} onChange={(date) => onChange({ date, ...RESET_MOVIE })} />
    case 'time':
      return (
        <TimeRange
          from={r.earliest_departure}
          to={r.latest_home}
          toLabel={`回到${station}`}
          onChange={(earliest_departure, latest_home) => onChange({ earliest_departure, latest_home })}
        />
      )
    case 'order':
      return (
        <Chips label="吃飯順序" value={r.order} onChange={(order) => onChange({ order })} options={[{ value: 'movie_first', label: '看完再吃' }, { value: 'meal_first', label: '先吃再看' }]} />
      )
    case 'movie':
      if (!day) return <Loading />
      return (
        <div className="space-y-4">
          <Field title="電影">
            <Chips
              label="電影"
              value={r.movie_id}
              onChange={(movie_id) => onChange(movie_id == null ? { movie_id } : { movie_id, movie_genre: null })}
              options={[{ value: null, label: '幫我挑' }, ...day.movies.map((m) => ({ value: m.id, label: m.title }))]}
            />
          </Field>
          {r.movie_id == null && day.genres.length > 0 && (
            <Field title="片型">
              <Chips label="片型" value={r.movie_genre} onChange={(movie_genre) => onChange({ movie_genre })} options={[any, ...day.genres.map((g) => ({ value: g.code, label: g.label }))]} />
            </Field>
          )}
          {day.hall_types.length > 0 && (
            <Field title="影廳">
              <Chips label="影廳" value={r.hall_type} onChange={(hall_type) => onChange({ hall_type })} options={[any, ...day.hall_types.map((h) => ({ value: h.code, label: h.label }))]} />
            </Field>
          )}
          {day.languages.length > 0 && (
            <Field title="語言">
              <Chips label="語言" value={r.language} onChange={(language) => onChange({ language })} options={[any, ...day.languages.map((v) => ({ value: v, label: v }))]} />
            </Field>
          )}
        </div>
      )
    case 'food':
      if (!cuisines) return <Loading />
      return <Chips label="料理類型" value={r.cuisine} onChange={(cuisine) => onChange({ cuisine })} options={[any, ...cuisines.map((c) => ({ value: c.code, label: c.label }))]} />
    case 'budget':
      return (
        <Field title="每人預算" hint="含來回車資、電影票、一餐。">
          <Chips label="每人預算" value={r.budget_per_person} onChange={(budget_per_person) => onChange({ budget_per_person })} options={BUDGET_OPTIONS.map((v) => ({ value: v, label: formatMoney(v) }))} />
        </Field>
      )
    case 'walk':
      return (
        <Field title="影城到餐廳最多走幾分鐘" hint={walkDistance(r.max_walk_minutes)}>
          <Chips label="步行上限" value={r.max_walk_minutes} onChange={(max_walk_minutes) => onChange({ max_walk_minutes })} options={WALK_OPTIONS.map((v) => ({ value: v, label: `${v} 分` }))} />
        </Field>
      )
  }
}
