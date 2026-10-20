import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import type { RunError } from '@/api/planRuns'
import type { PlanRequest } from '@/api/schemas'
import { relaxPlan, relaxShowtimes, type Relax } from './relax'

function RelaxButton({ x, onRelax }: { x: Relax; onRelax: (p: Partial<PlanRequest>) => void }) {
  return (
    <button
      onClick={() => onRelax(x.patch)}
      className="zg-surface flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:border-foreground/40"
    >
      <span className="font-medium">{x.label}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium">
        一鍵重算 <ArrowRight className="size-4" />
      </span>
    </button>
  )
}

/**
 * 無解（Q23）：不硬湊行程，老實說被哪些條件擋下，並給「放寬一級」的一鍵重算（2026-10-20 決定）。
 * 這反而證明「保證接得上」是真的。
 * - NO_FEASIBLE：後端附各條件排除的組數（reasons），排除最多的排最前面
 * - NO_SHOWTIMES：這天這個商圈沒有符合條件的場次
 */
export function NoSolution({ request, error, onRelax }: { request: PlanRequest; error: RunError; onRelax: (patch: Partial<PlanRequest>) => void }) {
  if (error.code === 'NO_SHOWTIMES') {
    const x = relaxShowtimes(request)
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <h1 className="text-2xl font-bold cine:font-semibold lin:font-semibold">這天沒有符合條件的場次</h1>
        <p className="mt-3 text-muted-foreground">這個商圈這一天找不到符合你選的電影條件的場次。</p>
        <div className="mt-8 space-y-3 text-left">
          {x && <RelaxButton x={x} onRelax={onRelax} />}
          <Link to="/plan/2" className="zg-surface flex items-center justify-between p-4 font-medium hover:border-foreground/40">
            換一天 <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    )
  }

  const { rows, buttons } = relaxPlan(error.reasons ?? {}, request)
  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <h1 className="text-2xl font-bold cine:font-semibold lin:font-semibold">這組條件，找不到每段都接得上的行程</h1>
      <p className="mt-3 text-muted-foreground">
        {rows[0] ? (
          <>
            最常卡在「<span className="font-medium text-zg-fail">{rows[0].label}</span>」。我們不會硬湊一個趕不上的行程給你。
          </>
        ) : (
          '我們不會硬湊一個趕不上的行程給你。'
        )}
      </p>
      {rows.length > 0 && (
        <ul className="zg-surface mt-6 divide-y text-left text-sm" aria-label="被哪些條件擋下">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span>{r.label}</span>
              <span className="zg-num text-xs text-muted-foreground">擋下 {r.count.toLocaleString()} 組</span>
            </li>
          ))}
        </ul>
      )}
      {buttons.length > 0 && (
        <div className="mt-8 space-y-3 text-left">
          <p className="text-sm font-medium">放寬一點再試試：</p>
          {buttons.map((x) => <RelaxButton key={x.label} x={x} onRelax={onRelax} />)}
        </div>
      )}
      <Link to="/plan/1" className="mt-8 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
        或回去自己改條件
      </Link>
    </div>
  )
}
