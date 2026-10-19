import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { usePlanStore } from '@/store/planStore'
import { STEPS, stepComplete } from './validation'

/**
 * 頂部進度（Q25）：①②③④，填完的步驟可以點回去改；旁邊「清空重來」（Q102），按了在畫面內確認一次。
 */
export function WizardProgress({ current }: { current: number }) {
  const request = usePlanStore((s) => s.request)
  const resetRequest = usePlanStore((s) => s.resetRequest)
  const [confirming, setConfirming] = useState(false)
  const navigate = useNavigate()
  return (
    <div>
      <ol className="grid grid-cols-4 gap-2" aria-label="規劃進度">
        {STEPS.map((s) => {
          const done = stepComplete(s.n, request)
          const active = s.n === current
          const reachable = active || done || s.n < current
          const body = (
            <>
              <span className={cn('block h-1 rounded-full bg-border transition-colors', (done || active) && 'bg-primary', active && 'opacity-100', !active && done && 'opacity-60')} />
              <span className={cn('mt-2 block text-xs', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                <span className="zg-num">{s.n}</span> {s.label}
              </span>
            </>
          )
          return (
            <li key={s.n}>
              {reachable && !active ? (
                <Link to={`/plan/${s.n}`} className="block hover:opacity-80">{body}</Link>
              ) : (
                <span aria-current={active ? 'step' : undefined} className="block">{body}</span>
              )}
            </li>
          )
        })}
      </ol>
      <div className="mt-2 flex h-6 justify-end text-xs">
        {confirming ? (
          <span className="flex items-center gap-2" role="alert">
            確定清空所有條件？
            <button className="font-medium text-zg-fail underline underline-offset-2" onClick={() => { resetRequest(); setConfirming(false); navigate('/plan/1') }}>
              清空
            </button>
            <button className="text-muted-foreground underline underline-offset-2" onClick={() => setConfirming(false)}>取消</button>
          </span>
        ) : (
          <button className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setConfirming(true)}>
            清空重來
          </button>
        )}
      </div>
    </div>
  )
}
