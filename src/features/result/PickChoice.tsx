import { Clapperboard, UtensilsCrossed } from 'lucide-react'
import type { ItineraryRequest, ItineraryResponse } from '@/api/schemas'
import { ChoiceCard } from '@/features/wizard/parts/Choice'

/**
 * 系統拿不定時，在結果之前多問一題（Q22、Q87）。
 * 不說「信心不足」，只說「這幾部都接得上，你比較想看哪一部？」。
 * 挑完把它當條件重算一次；也可以「都可以，幫我決定」直接看結果。
 */
export function PickChoice({ data, onPick, onSkip }: {
  data: ItineraryResponse
  onPick: (patch: Partial<ItineraryRequest>) => void
  onSkip: () => void
}) {
  const g = data.confidence_gate
  const movie = g.uncertain_field === 'movie'
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <p className="text-sm text-muted-foreground">快好了，再問一題</p>
      <h1 className="mt-2 text-2xl font-bold cine:font-semibold lin:font-semibold">
        {movie ? '這幾部都接得上，你比較想看哪一部？' : '這幾家都接得上，你比較想吃哪一家？'}
      </h1>
      <div role="radiogroup" aria-label={movie ? '電影' : '餐廳'} className="mt-8 space-y-3">
        {(g.choices ?? []).map((c) => (
          <ChoiceCard
            key={c.id}
            selected={false}
            onClick={() => onPick(movie ? { movie_title: c.label } : { restaurant_name: c.label })}
            icon={movie ? <Clapperboard className="size-4" /> : <UtensilsCrossed className="size-4" />}
            title={c.label}
          />
        ))}
      </div>
      <button onClick={onSkip} className="mt-6 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        都可以，幫我決定
      </button>
    </div>
  )
}
