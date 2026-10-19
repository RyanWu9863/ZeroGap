import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Link, useNavigate } from 'react-router'
import { usePlanStore } from '@/store/planStore'
import { SCENARIOS } from './scenarios'

/** 首屏：一句話講用途＋開始規劃＋3 張情境卡（Q14、Q18、Q30） */
export function Hero() {
  const setRequest = usePlanStore((s) => s.setRequest)
  const navigate = useNavigate()
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-mono text-xs tracking-[0.3em] text-muted-foreground">
        ZERO GAP · 零空檔
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl cine:font-semibold"
      >
        娛樂、餐廳、交通，
        <br />
        <span className="text-zg-ok cine:text-primary">一次排到剛剛好。</span>
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-6 max-w-xl text-lg text-muted-foreground">
        選好條件，我們把電影、晚餐、回程車排成<strong className="text-foreground">每一段都接得上</strong>的行程。不用再開三個 App 自己算。
      </motion.p>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-9">
        <Link
          to="/plan/1"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-base font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          開始規劃 <ArrowRight className="size-4" />
        </Link>
      </motion.div>
      <div className="mt-12">
        <p className="text-sm text-muted-foreground">或從常見情境開始：</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {SCENARIOS.map((s, i) => (
            <motion.button
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              onClick={() => {
                setRequest(s.patch)
                navigate('/plan/1')
              }}
              className="zg-surface group p-4 text-left transition-colors hover:border-foreground/40"
            >
              <span className="block font-medium">{s.title}</span>
              <span className="zg-num mt-1 block text-xs text-muted-foreground">{s.detail}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
                用這個開始 <ArrowRight className="size-3" />
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  )
}
