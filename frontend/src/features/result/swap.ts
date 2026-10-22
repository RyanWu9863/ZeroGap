import type { Plan } from '@/api/schemas'
import { restaurantName } from '@/shared/lib/format'

/*
 * 換一部／換一家（2026-10-20 決定 D2；規格書 6.5、6.7）。
 * 後端在 alternatives 附上其他候選，只有估計的到家時間和每人花費：
 * 換了以後只更新方案卡和花費區（黃底估計），時間軸不換。
 * 一次只能換一項：電影和餐廳的估計都是各自對原方案算的，不能疊加。
 */
export type Swap = { kind: 'movie' | 'restaurant'; index: number }

export type SwapView = {
  kind: Swap['kind']
  /** 換成的電影片名或餐廳名稱 */
  name: string
  /** 原本的電影片名或餐廳名稱 */
  original: string
  homeAt: string
  total: number
  /** 換電影時，搭配的餐廳也跟著換了（v0.11）：換成哪一家 */
  alsoRestaurant: string | null
}

type CuisineLabel = (code: string | null | undefined) => string | null

/** 這個方案有哪些可以換的項目（只看 alternatives 有沒有值，不看 decided_by；規格書 6.7） */
export function swappable(plan: Plan) {
  return { movie: plan.alternatives.movie ?? [], restaurant: plan.alternatives.restaurant ?? [] }
}

/** 換電影時搭配的餐廳也變了 → 換成哪一家；沒變是 null */
export function movieAltRestaurant(alt: NonNullable<Plan['alternatives']['movie']>[number], cuisineLabel: CuisineLabel): string | null {
  if (alt.restaurant_id == null) return null
  return restaurantName(alt.restaurant_name, cuisineLabel(alt.restaurant_cuisine))
}

export function swapView(plan: Plan, swap: Swap | null | undefined, cuisineLabel: CuisineLabel): SwapView | null {
  if (!swap) return null
  if (swap.kind === 'movie') {
    const alt = plan.alternatives.movie?.[swap.index]
    if (!alt) return null
    return { kind: 'movie', name: `《${alt.title}》`, original: `《${plan.movie.title}》`, homeAt: alt.home_at, total: alt.cost_per_person_total, alsoRestaurant: movieAltRestaurant(alt, cuisineLabel) }
  }
  const alt = plan.alternatives.restaurant?.[swap.index]
  if (!alt) return null
  return {
    kind: 'restaurant',
    name: restaurantName(alt.name, cuisineLabel(alt.cuisine)),
    original: restaurantName(plan.restaurant.name, plan.restaurant.cuisine_label),
    homeAt: alt.home_at,
    total: alt.cost_per_person_total,
    alsoRestaurant: null,
  }
}

/** 方案卡和花費區要顯示的到家時間、每人花費；換過就是估計值 */
export function planFigures(plan: Plan, view: SwapView | null) {
  const anyEstimated = plan.estimated.length > 0
  return view
    ? { homeAt: view.homeAt, total: view.total, estimated: true }
    : { homeAt: plan.home_at, total: plan.cost_per_person.total, estimated: anyEstimated }
}

/** 時間軸上方的提示句（D2）：「時間軸仍是原本的 XX；換成 YY 的到家時間和花費是估計」 */
export function swapNotice(view: SwapView): string {
  const also = view.alsoRestaurant ? `（餐廳也換成${view.alsoRestaurant}）` : ''
  return `時間軸仍是原本的${view.original}；換成${view.name}${also}的到家時間和花費是估計。`
}
