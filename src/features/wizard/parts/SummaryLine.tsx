import { Link } from 'react-router'
import { PICK_FOR_ME } from '@/api/schemas'
import { formatDate, formatMoney } from '@/shared/lib/format'
import { usePlanStore } from '@/store/planStore'

/** 送出前的一行條件摘要（Q53），每一段都可以點回那一步改 */
export function SummaryLine() {
  const r = usePlanStore((s) => s.request)
  const parts: { text: string; step: number }[] = [
    { text: `${r.origin_station || '？'} → ${r.district_hub || '？'}`, step: 1 },
    { text: `${r.date ? formatDate(r.date) : '？'} ${r.earliest_departure}–${r.latest_return}`, step: 2 },
    { text: r.dining_order === '先吃再看' ? '先吃再看' : '看完再吃', step: 2 },
    { text: r.movie_title === PICK_FOR_ME ? '幫我挑電影' : `《${r.movie_title}》`, step: 3 },
    { text: `${r.cuisine_type === '不限' ? '料理不限' : r.cuisine_type}・每人 ${formatMoney(r.budget_per_person)}`, step: 4 },
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
