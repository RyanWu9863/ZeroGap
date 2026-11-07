import { motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import type { Plan } from '@/api/schemas'
import { bufferLevel, LEVEL_LABEL } from '@/shared/lib/buffer'
import { clockOn } from '@/shared/lib/time'
import { arcPath, bottleneck, bottleneckCopy, DIAL_START, dialSegments, dialTicks, polar } from './dialModel'

const C = 160
const R = 120
const LEVEL_TEXT = { roomy: 'text-zg-ok', snug: 'text-zg-snug', tight: 'text-zg-tight' }
const LEVEL_VAR = { roomy: 'var(--zg-ok)', snug: 'var(--zg-snug)', tight: 'var(--zg-tight)' }

type SegType = 'transit' | 'walk' | 'movie' | 'meal' | 'wait'
const KINDS: { type: SegType; label: string; color: string; dashed?: boolean }[] = [
  { type: 'transit', label: '搭車', color: 'var(--zg-flow)' },
  { type: 'walk', label: '走路', color: 'var(--zg-flow)', dashed: true },
  { type: 'movie', label: '電影', color: 'var(--foreground)' },
  { type: 'meal', label: '用餐', color: 'var(--muted-foreground)' },
  { type: 'wait', label: '候位', color: 'var(--border)' },
]
const kindOf = (t: string) => KINDS.find((k) => k.type === t) ?? KINDS[4]

/**
 * 錶盤：出門到到家畫成一段 300 度的弧，每一段一種顏色，最緊的一段打聚光燈並說明後果。
 * 聚光燈說明預設展開；可以左右滑（或 onPrev／onNext）換方案。
 */
export function PlanDial({ plan, date, stationName, onPrev, onNext }: {
  plan: Plan
  date: string
  stationName: string
  onPrev?: () => void
  onNext?: () => void
}) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(true)
  const down = useRef<{ x: number; y: number; id: number } | null>(null)
  const segments = dialSegments(plan)
  const ticks = dialTicks(plan)
  const b = bottleneck(plan)
  const copy = b ? bottleneckCopy(b, stationName) : null
  const level = b ? bufferLevel(b.minutes) : null
  const spot = b ? polar(C, C, R, b.angle) : null
  const present = KINDS.filter((k) => segments.some((s) => s.type === k.type))

  return (
    <figure
      className="w-full"
      data-testid="plan-dial"
      style={{ touchAction: 'pan-y pinch-zoom' }}
      onPointerDown={(e) => {
        down.current = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null
      }}
      onPointerCancel={() => {
        down.current = null
      }}
      onPointerUp={(e) => {
        const d = down.current
        if (!d || d.id !== e.pointerId) return
        down.current = null
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) onNext?.()
          else onPrev?.()
        }
      }}
    >
      <figcaption className="sr-only">
        這個方案 {clockOn(plan.depart_at, date)} 出門、{clockOn(plan.home_at, date)} 到家，共 {segments.length} 段
        {copy ? `；最緊的是：${copy.title}` : ''}
      </figcaption>
      <div className="relative mx-auto w-full max-w-[20rem]">
        <svg viewBox="0 0 320 320" aria-hidden="true" className="mx-auto w-full max-w-[20rem]">
          <defs>
            {level && (
              <radialGradient id="dial-spot-glow">
                <stop offset="0%" stopColor={LEVEL_VAR[level]} stopOpacity="0.55" />
                <stop offset="100%" stopColor={LEVEL_VAR[level]} stopOpacity="0" />
              </radialGradient>
            )}
          </defs>
          <path d={arcPath(C, C, R, DIAL_START, -DIAL_START)} fill="none" stroke="var(--border)" strokeWidth={16} />
          {ticks.map((t) => {
            const a = polar(C, C, 104, t.angle)
            const z = polar(C, C, 112, t.angle)
            const l = polar(C, C, 92, t.angle)
            return (
              <g key={t.label}>
                <line x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke="var(--muted-foreground)" strokeWidth={1} />
                <text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="var(--muted-foreground)" style={{ fontFamily: 'var(--zg-num-font)' }}>
                  {t.label}
                </text>
              </g>
            )
          })}
          {segments.map((s, i) => {
            const k = kindOf(s.type)
            return (
              <motion.path
                key={`${plan.rank}-${s.index}`}
                d={arcPath(C, C, R, s.a0, s.a1)}
                fill="none"
                stroke={k.color}
                strokeWidth={16}
                strokeLinecap="butt"
                strokeDasharray={k.dashed ? '4 4' : undefined}
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
              />
            )
          })}
          {spot && level && (
            <g>
              <circle cx={spot.x} cy={spot.y} r={22} fill="url(#dial-spot-glow)" />
              <motion.circle
                cx={spot.x}
                cy={spot.y}
                r={7}
                fill={LEVEL_VAR[level]}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                animate={reduce ? undefined : { scale: [1, 1.25, 1] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              />
            </g>
          )}
          <g textAnchor="middle" fill="var(--foreground)">
            <text x={C} y={C - 22} fontSize={11} fill="var(--muted-foreground)">出門</text>
            <text x={C} y={C + 4} fontSize={28} fontWeight={600} style={{ fontFamily: 'var(--zg-num-font)' }}>{clockOn(plan.depart_at, date)}</text>
            <text x={C} y={C + 30} fontSize={11} fill="var(--muted-foreground)">到家</text>
            <text x={C} y={C + 56} fontSize={28} fontWeight={600} style={{ fontFamily: 'var(--zg-num-font)' }}>{clockOn(plan.home_at, date)}</text>
          </g>
        </svg>
        {spot && copy && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="dial-bottleneck"
            aria-label={`最緊的一段：${copy.title}，看會怎樣`}
            onClick={() => setOpen((v) => !v)}
            className="absolute size-11 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{ left: `${(spot.x / 320) * 100}%`, top: `${(spot.y / 320) * 100}%` }}
          />
        )}
      </div>
      <div id="dial-bottleneck" hidden={!open} className="mt-3 text-sm">
        {copy && level && b && (
          <>
            <p className={`font-semibold ${LEVEL_TEXT[level]}`}>{copy.title}</p>
            <p className="mt-1">{copy.consequence}</p>
            <p className="mt-1 text-xs text-muted-foreground">緩衝 {LEVEL_LABEL[level]}</p>
          </>
        )}
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {present.map((k) => (
          <li key={k.type} className="flex items-center gap-1.5">
            <svg width="14" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="14" y2="3" stroke={k.color} strokeWidth={6} strokeDasharray={k.dashed ? '3 3' : undefined} />
            </svg>
            {k.label}
          </li>
        ))}
      </ul>
    </figure>
  )
}
