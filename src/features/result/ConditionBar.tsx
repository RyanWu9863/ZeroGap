import { Link } from 'react-router'
import type { ItineraryRequest } from '@/api/schemas'
import { formatDate, formatMoney } from '@/shared/lib/format'

/**
 * 結果頁頂端的條件摘要（Q13b、Q58）。
 * 試做稿：點了回到精靈對應的那一步；精靈完成後改成「點哪個就彈出小視窗、改完重算」。
 */
export function ConditionBar({ req }: { req: ItineraryRequest }) {
  const movie = req.movie_title === '交給 Jev 決定' ? '幫我挑電影' : `《${req.movie_title}》`
  const chips: { label: string; step: number }[] = [
    { label: `${req.origin_station} → ${req.district_hub}`, step: 1 },
    { label: formatDate(req.date), step: 2 },
    { label: `${req.earliest_departure}–${req.latest_return}`, step: 2 },
    { label: req.dining_order === '先吃再看' ? '先吃再看' : '看完再吃', step: 2 },
    { label: movie, step: 3 },
    { label: req.cuisine_type === '不限' ? '料理不限' : req.cuisine_type, step: 4 },
    { label: `每人 ${formatMoney(req.budget_per_person)}`, step: 4 },
    { label: `步行 ≤ ${req.max_walk_minutes} 分`, step: 4 },
  ]
  return (
    <div className="flex flex-wrap gap-2" aria-label="目前條件">
      {chips.map((c) => (
        <Link
          key={c.label}
          to={`/plan/${c.step}`}
          className="zg-num rounded-full border bg-card px-3 py-1 text-xs transition-colors hover:border-foreground/50"
          title="修改這個條件"
        >
          {c.label}
        </Link>
      ))}
    </div>
  )
}
