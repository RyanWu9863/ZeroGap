import { PICK_FOR_ME, type ItineraryRequest } from '@/api/schemas'
import { useOptions } from '@/api/queries'
import { formatMoney, stationLabel, walkDistance } from '@/shared/lib/format'
import { Chips, Field } from '@/features/wizard/parts/Choice'
import { DateCalendar } from '@/features/wizard/parts/DateCalendar'
import { StationPicker } from '@/features/wizard/parts/StationPicker'
import { TimeRange } from '@/features/wizard/parts/TimeRange'

export type ConditionKind = 'place' | 'date' | 'time' | 'order' | 'movie' | 'food' | 'budget' | 'walk'

type Props = { kind: ConditionKind; value: ItineraryRequest; onChange: (patch: Partial<ItineraryRequest>) => void }

/** 小視窗裡的編輯器（Q58）：直接重用精靈的元件，操作方式跟精靈一模一樣 */
export function ConditionEditor({ kind, value: r, onChange }: Props) {
  const base = useOptions()
  const districtId = base.data?.districts.find((d) => d.name === r.district_hub)?.id
  const day = useOptions(r.date, districtId)
  const o = base.data
  if (!o) return <p className="py-6 text-center text-muted-foreground">載入中…</p>

  switch (kind) {
    case 'place':
      return (
        <div className="space-y-4">
          <Field title="商圈">
            <Chips label="商圈" value={r.district_hub} onChange={(district_hub) => onChange({ district_hub })} options={o.districts.map((d) => ({ value: d.name, label: d.name }))} />
          </Field>
          <Field title="出發站">
            <StationPicker stations={o.stations} value={r.origin_station} onChange={(origin_station) => onChange({ origin_station })} />
          </Field>
        </div>
      )
    case 'date':
      return <DateCalendar available={o.available_dates ?? []} value={r.date} onChange={(date) => onChange({ date })} />
    case 'time':
      return (
        <TimeRange
          from={r.earliest_departure}
          to={r.latest_return}
          toLabel={`回到${stationLabel(r.origin_station)}`}
          onChange={(earliest_departure, latest_return) => onChange({ earliest_departure, latest_return })}
        />
      )
    case 'order':
      return (
        <Chips label="吃飯順序" value={r.dining_order} onChange={(dining_order) => onChange({ dining_order })} options={[{ value: '看完電影再吃', label: '看完再吃' }, { value: '先吃再看', label: '先吃再看' }]} />
      )
    case 'movie':
      return (
        <Chips
          label="電影"
          value={r.movie_title}
          onChange={(movie_title) => onChange({ movie_title })}
          options={[{ value: PICK_FOR_ME, label: '幫我挑' }, ...(day.data?.movies ?? []).map((m) => ({ value: m.title, label: m.title }))]}
        />
      )
    case 'food':
      return <Chips label="料理類型" value={r.cuisine_type} onChange={(cuisine_type) => onChange({ cuisine_type })} options={o.cuisine_types.map((v) => ({ value: v, label: v }))} />
    case 'budget':
      return (
        <Field title="每人預算" hint="含來回車資、電影票、一餐。">
          <Chips label="每人預算" value={r.budget_per_person} onChange={(budget_per_person) => onChange({ budget_per_person })} options={o.budget_options.map((v) => ({ value: v, label: formatMoney(v) }))} />
        </Field>
      )
    case 'walk':
      return (
        <Field title="影城到餐廳最多走幾分鐘" hint={walkDistance(r.max_walk_minutes)}>
          <Chips label="步行上限" value={r.max_walk_minutes} onChange={(max_walk_minutes) => onChange({ max_walk_minutes })} options={o.walk_minutes_options.map((v) => ({ value: v, label: `${v} 分` }))} />
        </Field>
      )
  }
}
