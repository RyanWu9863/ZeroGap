import { ArrowLeftRight, Undo2 } from 'lucide-react'
import type { Plan, RouteAlternative } from '@/api/schemas'
import { useCuisineLabel } from '@/api/labels'
import { cn } from '@/lib/utils'
import { formatMoney, restaurantName } from '@/shared/lib/format'
import { clockOn } from '@/shared/lib/time'
import { movieAltRestaurant, type Swap } from './swap'

type SwapProps = {
  plan: Plan
  kind: Swap['kind']
  date: string
  swap: Swap | null
  onSwap: (s: Swap | null) => void
}

/**
 * 時間軸上電影、用餐那一步底下的「換一部／換一家」（2026-10-20 決定 D2）。
 * 後端有附備選（alternatives）才出現。文案不講 Jev、AI、機率（Q16）。
 * 換了以後只更新到家時間和每人花費（估計值），時間軸不換。
 */
export function SwapChoices({ plan, kind, date, swap, onSwap }: SwapProps) {
  const cuisineLabel = useCuisineLabel()
  const options =
    kind === 'movie'
      ? (plan.alternatives.movie ?? []).map((a) => ({ name: `《${a.title}》`, homeAt: a.home_at, total: a.cost_per_person_total, also: movieAltRestaurant(a, cuisineLabel) }))
      : (plan.alternatives.restaurant ?? []).map((a) => ({ name: restaurantName(a.name, cuisineLabel(a.cuisine)), homeAt: a.home_at, total: a.cost_per_person_total, also: null }))
  if (options.length === 0) return null
  const active = swap?.kind === kind ? swap.index : null
  return (
    <div className="mt-3 rounded-lg border border-dashed p-3" data-testid={`swap-${kind}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <ArrowLeftRight className="size-3.5" aria-hidden="true" />
        {kind === 'movie' ? '這幾部也接得上，想換一部嗎？' : '這幾家也接得上，想換一家嗎？'}
      </p>
      <ul className="mt-2 space-y-1.5">
        {options.map((o, i) => (
          <li key={i}>
            <button
              type="button"
              aria-pressed={active === i}
              onClick={() => onSwap(active === i ? null : { kind, index: i })}
              className={cn(
                'flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-foreground/40 pointer-coarse:min-h-11',
                active === i && 'border-foreground bg-muted',
              )}
            >
              <span className="font-medium">
                {active === i ? '已換成' : '換'}
                {o.name}
              </span>
              <span className="zg-num text-xs text-muted-foreground">
                約 {clockOn(o.homeAt, date)} 回到站・每人約 {formatMoney(o.total)}
              </span>
              {o.also && <span className="basis-full text-xs text-zg-tight">餐廳也會跟著換成{o.also}</span>}
            </button>
          </li>
        ))}
      </ul>
      {active != null && (
        <button type="button" onClick={() => onSwap(null)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline pointer-coarse:py-2">
          <Undo2 className="size-3.5" aria-hidden="true" /> 換回原本的
        </button>
      )}
    </div>
  )
}

/**
 * 去程、回程那段交通底下的「其他班次」（D4）：只看不換。
 * 路線的備選是 TDX 查到的另外幾條，所以時間和車資是精確值。
 */
export function OtherTrains({ routes, date }: { routes: RouteAlternative[]; date: string }) {
  if (routes.length === 0) return null
  return (
    <div className="mt-3 text-xs text-muted-foreground" data-testid="other-trains">
      <p className="font-medium text-foreground">其他班次</p>
      <ul className="mt-1 space-y-0.5">
        {routes.map((r, i) => (
          <li key={i} className="zg-num">
            {clockOn(r.depart_at, date)} 出發 → {clockOn(r.arrive_at, date)} 抵達・{r.summary}・{formatMoney(r.fare_per_person)}
          </li>
        ))}
      </ul>
    </div>
  )
}
