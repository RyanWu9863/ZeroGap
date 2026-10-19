import { ExternalLink } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { Proposal } from '@/api/schemas'
import { bufferSentence } from '@/shared/lib/buffer'
import { placeUrl } from '@/shared/lib/maps'
import { BufferChip } from '@/shared/ui/BufferChip'
import { Money } from '@/shared/ui/Money'
import { StepIcon } from '@/shared/ui/StepIcon'

/**
 * 結果頁主角：大時間軸（Q13b、Q56、Q34）。
 * 每一步：時刻＋圖示＋地點（可點開 Google 地圖）＋細節＋該段花費；
 * 兩步之間是緩衝標籤，把「為什麼接得上」直接織進時間軸。
 */
export function Timeline({ plan, stationName }: { plan: Proposal; stationName: string }) {
  return (
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
        {plan.timeline_steps.map((s, i) => {
          const cost = s.cost_item ? plan.cost_breakdown[s.cost_item] : null
          const last = i === plan.timeline_steps.length - 1
          return (
            <motion.li
              key={`${s.time}-${s.type}`}
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              className="grid grid-cols-[3.5rem_2.25rem_1fr] gap-x-3 sm:grid-cols-[4rem_2.25rem_1fr]"
            >
              <span className="zg-num pt-1.5 text-lg font-semibold sm:text-xl">{s.time}</span>
              <span className="flex flex-col items-center">
                <StepIcon type={s.type} />
                {!last && <span className="w-px flex-1 bg-border" aria-hidden="true" />}
              </span>
              <div className="pb-6 pt-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-medium">
                    {s.place ? (
                      <a
                        href={placeUrl(s.place)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline decoration-border underline-offset-4 hover:decoration-foreground"
                      >
                        {s.place.name}
                        <ExternalLink className="size-3 text-muted-foreground" aria-label="在 Google 地圖開啟" />
                      </a>
                    ) : (
                      s.type
                    )}
                  </p>
                  {cost && <Money amount={cost.amount} estimated={cost.is_estimated} className="text-sm" />}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.desc}</p>
                {s.buffer_minutes != null && s.buffer_gate && (
                  <BufferChip className="mt-2.5" minutes={s.buffer_minutes} text={bufferSentence(s.buffer_gate, s.buffer_minutes, stationName)} />
                )}
              </div>
            </motion.li>
          )
        })}
      </motion.ol>
    </AnimatePresence>
  )
}
