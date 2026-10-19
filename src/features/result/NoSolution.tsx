import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import type { ItineraryRequest, ItineraryResponse } from '@/api/schemas'
import { gateLabels, relaxLabel } from '@/shared/lib/gates'

/**
 * 無解（Q23）：不硬湊行程，老實說卡在哪一關，並把後端算好的放寬建議變成一鍵重算按鈕。
 * 這反而證明「保證接得上」是真的。
 */
export function NoSolution({ request, data, onRelax }: {
  request: ItineraryRequest
  data: ItineraryResponse
  onRelax: (patch: Partial<ItineraryRequest>) => void
}) {
  const ns = data.no_solution!
  const gate = gateLabels(request).find((g) => g.id === ns.blocking_filter.id)
  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <h1 className="text-2xl font-bold cine:font-semibold lin:font-semibold">這組條件，找不到每段都接得上的行程</h1>
      <p className="mt-3 text-muted-foreground">
        卡在「<span className="font-medium text-zg-fail">{gate?.label ?? ns.blocking_filter.name}</span>」這一關。我們不會硬湊一個趕不上的行程給你。
      </p>
      <div className="mt-8 space-y-3 text-left">
        <p className="text-sm font-medium">放寬一點就有：</p>
        {ns.relax_suggestions.map((s) => (
          <button
            key={s.field}
            onClick={() => onRelax({ [s.field]: s.suggested_value } as Partial<ItineraryRequest>)}
            className="zg-surface flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:border-foreground/40"
          >
            <span>
              <span className="block font-medium">{relaxLabel(s.field, s.suggested_value)}</span>
              <span className="zg-num text-xs text-muted-foreground">可找到 {s.feasible_count_after} 組接得上的行程</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium">
              一鍵重算 <ArrowRight className="size-4" />
            </span>
          </button>
        ))}
      </div>
      <Link to="/plan/1" className="mt-8 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        或回去自己改條件
      </Link>
    </div>
  )
}
