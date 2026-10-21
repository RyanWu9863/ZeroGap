import { motion } from 'motion/react'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { bufferSentence } from '@/shared/lib/buffer'
import { describeTimeline } from '@/shared/lib/steps'
import { BufferChip } from '@/shared/ui/BufferChip'
import { StepIcon } from '@/shared/ui/StepIcon'

/** 範例用假資料的基準案例第 1 案，不打後端 */
const steps = describeTimeline(mockResult(benchmarkRequest, false).plans[0], benchmarkRequest.date)

/** 介紹頁第 2 區：直接秀成品，每段緩衝一格一格打勾（Q44） */
export function TimelinePreview() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">WHAT YOU GET</p>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl cine:font-semibold lin:font-semibold">每一段，都先幫你算好。</h2>
          <p className="mt-4 text-muted-foreground">
            趕不趕得上開演、來不來得及點餐、回程車還有沒有——每兩步之間的餘裕都寫給你看，綠色代表寬鬆、藍色剛好、橘色偏緊。
          </p>
        </div>
        <motion.ol
          className="zg-surface relative min-w-0 space-y-1 p-5 sm:p-6"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          transition={{ staggerChildren: 0.18 }}
        >
          <span className="absolute right-4 top-4 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">範例</span>
          {steps.map((s) => (
            <motion.li
              key={s.key}
              variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
              className="flex flex-wrap items-center gap-3 py-1.5"
            >
              <span className="zg-num w-12 text-sm font-semibold">{s.time}</span>
              <StepIcon type={s.type} bus={s.bus} className="size-7" />
              <span className="min-w-0 flex-1 truncate text-sm">{s.desc}</span>
              {s.buffer && (
                <motion.span
                  className="basis-full sm:pl-[5.5rem]"
                  variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }}
                >
                  <BufferChip minutes={s.buffer.minutes} text={bufferSentence(s.buffer.gate, s.buffer.minutes, '中壢站', s.buffer.window)} />
                </motion.span>
              )}
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  )
}
