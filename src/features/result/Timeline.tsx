import { ExternalLink, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { Plan } from '@/api/schemas'
import { SourceCredit } from '@/shared/brand/Attribution'
import { bufferSentence } from '@/shared/lib/buffer'
import { placeUrl } from '@/shared/lib/maps'
import { describeTimeline } from '@/shared/lib/steps'
import { BufferChip } from '@/shared/ui/BufferChip'
import { Money } from '@/shared/ui/Money'
import { StepIcon } from '@/shared/ui/StepIcon'
import { OtherTrains, SwapChoices } from './Alternatives'
import type { Swap } from './swap'

type Props = {
  plan: Plan
  /** 使用者選的日期，跨午夜的時刻才標得出「隔天」 */
  date: string
  stationName: string
  swap: Swap | null
  onSwap: (s: Swap | null) => void
}

/** 每一步底下另外掛的東西：換一部／換一家、其他班次、營業時間未確認 */
function extrasFor(plan: Plan, props: Props): Map<number, ReactNode[]> {
  const out = new Map<number, ReactNode[]>()
  const steps = plan.timeline
  const movie = steps.findIndex((s) => s.type === 'movie')
  const meal = steps.findIndex((s) => s.type === 'meal')
  const go = steps.findIndex((s) => s.type === 'transit')
  const back = steps.findLastIndex((s) => s.type === 'transit')
  const add = (i: number, node: ReactNode) => {
    if (i >= 0) out.set(i, [...(out.get(i) ?? []), node])
  }
  if (meal >= 0 && !plan.restaurant.hours_verified) {
    add(
      meal,
      <p key="hours" className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-zg-tight-soft px-2.5 py-1 text-xs font-medium text-zg-tight">
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        營業時間未確認，請向店家確認
      </p>,
    )
  }
  if (plan.alternatives.movie?.length) add(movie, <SwapChoices key="m" plan={plan} kind="movie" date={props.date} swap={props.swap} onSwap={props.onSwap} />)
  if (plan.alternatives.restaurant?.length) add(meal, <SwapChoices key="r" plan={plan} kind="restaurant" date={props.date} swap={props.swap} onSwap={props.onSwap} />)
  if (plan.alternatives.route_go?.length) add(go, <OtherTrains key="go" routes={plan.alternatives.route_go} date={props.date} />)
  if (back !== go && plan.alternatives.route_return?.length) add(back, <OtherTrains key="back" routes={plan.alternatives.route_return} date={props.date} />)
  return out
}

/**
 * 結果頁主角：大時間軸（Q13b、Q56、Q34）。
 * 每一步：時刻＋圖示＋地點（可點開 Google 地圖）＋細節＋該段花費；
 * 結束時有關卡的步驟附緩衝標籤，把「為什麼接得上」直接織進時間軸。
 * 底部依餐廳來源放 Google 標誌或 OpenStreetMap 出處（規格書 6.7）。
 */
export function Timeline(props: Props) {
  const { plan, date, stationName } = props
  const steps = describeTimeline(plan, date)
  const extras = extrasFor(plan, props)
  return (
    <div>
      <AnimatePresence mode="wait">
        <motion.ol
          key={plan.rank}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ staggerChildren: 0.06 }}
          className="relative"
          aria-label="行程時間軸"
        >
          {steps.map((s, i) => {
            const last = i === steps.length - 1
            return (
              <motion.li
                key={s.key}
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                className="grid grid-cols-[3.5rem_2.25rem_1fr] gap-x-3 sm:grid-cols-[4rem_2.25rem_1fr]"
                data-step={s.type}
              >
                <span className={`zg-num pt-1.5 font-semibold ${s.time.length > 5 ? 'text-sm sm:text-base' : 'text-lg sm:text-xl'}`}>{s.time}</span>
                <span className="flex flex-col items-center">
                  <StepIcon type={s.type} bus={s.bus} />
                  {!last && <span className="w-px flex-1 bg-border" aria-hidden="true" />}
                </span>
                <div className="min-w-0 pb-6 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">
                      {s.place ? (
                        <a
                          href={placeUrl(s.place)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline decoration-border underline-offset-4 hover:decoration-foreground pointer-coarse:py-1.5"
                        >
                          {s.title}
                          <ExternalLink className="size-3 text-muted-foreground" aria-label="在 Google 地圖開啟" />
                        </a>
                      ) : (
                        s.title
                      )}
                    </p>
                    {s.cost && <Money amount={s.cost.amount} estimated={s.cost.estimated} className="text-sm" />}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.desc}</p>
                  {s.buffer && <BufferChip className="mt-2.5" minutes={s.buffer.minutes} text={bufferSentence(s.buffer.gate, s.buffer.minutes, stationName, s.buffer.window)} />}
                  {extras.get(i)}
                </div>
              </motion.li>
            )
          })}
        </motion.ol>
      </AnimatePresence>
      <SourceCredit source={plan.restaurant.source} className="-mb-2 mt-2" />
    </div>
  )
}
