import { homeLabel, homeMinutes, toHHMM, toMinutes } from '../validation'

const MIN = 10 * 60 // 10:00
const MAX = 26 * 60 // 隔天 02:00（後端允許最晚回到站跨到隔天 02:00，2026-10-20 決定放寬）
const STEP = 15
const pct = (m: number) => ((m - MIN) / (MAX - MIN)) * 100

/**
 * 一條雙頭時間滑桿（Q48）：左頭「出門」、右頭「回到車站」，每格 15 分。
 * 兩個原生 range 疊在一起，鍵盤左右鍵也能調（Q88）。
 * 右頭超過 24:00 就是隔天：送出 "01:30"，畫面寫「隔天 01:30」。
 */
export function TimeRange({ from, to, onChange, toLabel }: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  toLabel: string
}) {
  const a = toMinutes(from)
  const b = homeMinutes(to)
  return (
    <div>
      <div className="flex justify-between gap-3 text-sm">
        <span>
          最早 <span className="zg-num text-lg font-semibold">{from}</span> 出門
        </span>
        <span className="text-right">
          最晚 <span className="zg-num text-lg font-semibold">{homeLabel(to)}</span> {toLabel}
        </span>
      </div>
      <div className="relative mt-4 h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary" style={{ left: `${pct(a)}%`, right: `${100 - pct(b)}%` }} />
        <input
          type="range" min={MIN} max={MAX} step={STEP} value={a}
          aria-label="最早出門時間" aria-valuetext={from}
          onChange={(e) => onChange(toHHMM(Math.min(Number(e.target.value), b - 60, 23 * 60 + 45)), to)}
          className="zg-range"
        />
        <input
          type="range" min={MIN} max={MAX} step={STEP} value={b}
          aria-label={`最晚${toLabel}時間`} aria-valuetext={homeLabel(to)}
          onChange={(e) => onChange(from, toHHMM(Math.max(Number(e.target.value), a + 60)))}
          className="zg-range"
        />
      </div>
      <div className="zg-num mt-1 flex justify-between text-[11px] text-muted-foreground">
        {[10, 14, 18, 22].map((h) => <span key={h}>{h}:00</span>)}
        <span>隔天 02:00</span>
      </div>
    </div>
  )
}
