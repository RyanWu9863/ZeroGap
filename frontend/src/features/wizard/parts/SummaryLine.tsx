import { Link } from 'react-router'
import { useRequestLabels } from '@/api/labels'
import { formatDate, formatMoney } from '@/shared/lib/format'
import { usePlanStore } from '@/store/planStore'
import { homeLabel } from '../validation'

/** 送出前的一行條件摘要（Q53），每一段都可以點回那一步改 */
export function SummaryLine() {
  const r = usePlanStore((s) => s.request)
  const l = useRequestLabels(r)
  const parts: { text: string; step: number }[] = [
    { text: `${r.origin_station_id || r.origin_lat != null ? l.station : '？'} → ${r.area ? l.area : '？'}`, step: 1 },
    { text: `${r.date ? formatDate(r.date) : '？'} ${r.earliest_departure}–${homeLabel(r.latest_home)}`, step: 2 },
    { text: r.order === 'meal_first' ? '先吃再看' : '看完再吃', step: 2 },
    { text: l.movie ? `《${l.movie}》` : '幫我挑電影', step: 3 },
    { text: `${l.cuisine ?? '料理不限'}・每人 ${formatMoney(r.budget_per_person)}`, step: 4 },
  ]
  return (
    <p className="text-center text-xs leading-relaxed text-muted-foreground sm:text-sm">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && '、'}
          <Link to={`/plan/${p.step}`} className="zg-num underline decoration-border underline-offset-4 hover:text-foreground">
            {p.text}
          </Link>
        </span>
      ))}
    </p>
  )
}
