import { useCuisineLabel } from '@/api/labels'
import type { Plan } from '@/api/schemas'
import { restaurantName } from '@/shared/lib/format'
import { clockOn } from '@/shared/lib/time'
import { FreshnessNote } from './FreshnessNote'

/**
 * 「這個方案怎麼來的」：這次真的算了幾種組合、幾種接得上、挑出幾個，
 * 加上這個方案其他也排得進去的選擇。不講 AI、Jev、機率（Q16）。
 */
export function HowItWasMade({
  plan,
  stats,
  plansCount,
  date,
}: {
  plan: Plan
  stats: { combinations: number; feasible: number }
  plansCount: number
  date: string
}) {
  const cuisineLabel = useCuisineLabel()
  const alt = plan.alternatives
  const others = [
    ...(alt.movie ?? []).map((a) => `《${a.title}》，${clockOn(a.home_at, date)} 到家`),
    ...(alt.restaurant ?? []).map((a) => `${restaurantName(a.name, cuisineLabel(a.cuisine))}，${clockOn(a.home_at, date)} 到家`),
    ...(alt.route_go ?? []).map((r) => `去程：${r.summary}，${clockOn(r.depart_at, date)} 出發`),
    ...(alt.route_return ?? []).map((r) => `回程：${r.summary}，${clockOn(r.depart_at, date)} 出發`),
  ]
  const steps = [
    { n: stats.combinations, label: '種組合' },
    { n: stats.feasible, label: '種每段都接得上' },
    { n: plansCount, label: '個挑出來給你' },
  ]
  return (
    <details className="zg-surface p-4">
      <summary className="cursor-pointer text-sm font-medium pointer-coarse:py-2">這個方案怎麼來的</summary>
      <div className="mt-4 space-y-5 text-sm">
        <div>
          <ol className="grid grid-cols-3 gap-2 text-center">
            {steps.map((s) => (
              <li key={s.label} className="rounded-lg bg-muted px-2 py-3">
                <span className="zg-num block text-xl font-bold">{s.n.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            從 {stats.combinations.toLocaleString()} 種組合中，找到 {stats.feasible.toLocaleString()} 種每段都接得上，挑出 {plansCount} 個給你。每一種組合都檢查過開演、點餐、走路、回程車和預算五道關卡。
          </p>
        </div>
        {plan.highlight?.reason && <p>{plan.highlight.reason}</p>}
        <div>
          <p className="font-medium">其他也排得進去的選擇</p>
          {others.length === 0 ? (
            <p className="mt-1 text-muted-foreground">這個方案沒有其他接得上的備選。</p>
          ) : (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              {others.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
        </div>
        <FreshnessNote />
      </div>
    </details>
  )
}
