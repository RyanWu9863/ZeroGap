import { motion, useReducedMotion } from 'motion/react'
import { EASE_OUT } from '@/shared/theme/motion'
import { alive, type DotPlan } from './funnelModel'

const COLS = 15
const CELL = 20
const W = COLS * CELL
const PLAN_Y = 205

/**
 * 漏斗點陣：一個點＝「全部組合 ÷ 點數」組。k＝已經判定完幾道關卡，被那一關淘汰的點變灰、往下掉。
 * converged＝五關都過完：留下的點往下收，變成最後挑出的方案節點（labels 是方案的特色標籤）。
 * 每個點的去留都來自真實的每關剔除數（funnelModel.planDots），不是隨機演出來的。
 */
export function FunnelField({ plan, k, converged, labels, failedGate }: {
  plan: DotPlan
  k: number
  converged: boolean
  labels: string[]
  /** 無解時卡住的關卡（0 起算），那一關淘汰的點標成紅色 */
  failedGate?: number | null
}) {
  const reduce = useReducedMotion()
  const t = (delay = 0) => (reduce ? { duration: 0 } : { duration: 0.5, ease: EASE_OUT, delay })
  const planX = labels.map((_, i) => (W / (labels.length + 1)) * (i + 1))

  return (
    <svg viewBox={`0 0 ${W} ${PLAN_Y + 28}`} className="w-full overflow-visible" aria-hidden="true">
      {/* 方案節點的位置先畫淡淡的虛線，收斂時點會落到這裡 */}
      {!converged && <line x1={CELL} x2={W - CELL} y1={PLAN_Y} y2={PLAN_Y} stroke="var(--border)" strokeDasharray="3 5" />}
      {plan.fate.map((fate, i) => {
        const x = (i % COLS) * CELL + CELL / 2
        const y = Math.floor(i / COLS) * CELL + CELL / 2
        const live = alive(fate, k)
        const gone = !live
        const failed = gone && failedGate != null && fate === failedGate
        // 收斂：留下的點往下集中到方案節點，依序分給三個方案
        const target = converged && live ? planX[i % Math.max(labels.length, 1)] : x
        return (
          <motion.circle
            key={i}
            initial={false}
            animate={{
              cx: target,
              cy: converged && live ? PLAN_Y : gone ? y + 5 : y,
              r: gone ? 2.2 : converged ? 3 : 4.5,
              opacity: converged ? (live ? 0 : 0.18) : failed ? 0.7 : gone ? 0.28 : 0.9,
              fill: failed ? 'var(--zg-fail)' : gone ? 'var(--zg-chart-drop)' : 'var(--zg-chart-keep)',
            }}
            transition={t(gone ? (i % 7) * 0.025 : 0)}
          />
        )
      })}
      {converged &&
        labels.map((label, i) => (
          <motion.g key={label} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={t(0.25 + i * 0.08)}>
            <circle cx={planX[i]} cy={PLAN_Y} r={9} fill="var(--zg-chart-keep)" />
            <text x={planX[i]} y={PLAN_Y + 24} textAnchor="middle" className="fill-foreground text-[11px] font-medium">
              {label}
            </text>
          </motion.g>
        ))}
    </svg>
  )
}
