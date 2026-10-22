import { Check, X } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

type Row = { time: string; text: string; ok: boolean; note: string }

/* 示意情境，不是真實資料（介紹頁講故事用，Q86） */
const DIY: Row[] = [
  { time: '18:30', text: '看電影，片長 130 分', ok: true, note: '看起來沒問題' },
  { time: '20:40', text: '散場，走到餐廳要 8 分', ok: false, note: '到了還要候位 20 分，21:00 已停止點餐' },
  { time: '22:20', text: '吃完走回車站', ok: false, note: '回程車已經開走' },
]
const ZG: Row[] = [
  { time: '17:55', text: '開演', ok: true, note: '開演前還有 10 分' },
  { time: '20:19', text: '入座用餐', ok: true, note: '離最後點餐還有 41 分' },
  { time: '21:38', text: '搭回程車', ok: true, note: '車開前還有 11 分' },
  { time: '22:03', text: '回到中壢站', ok: true, note: '比最晚時間早 57 分' },
]

function Column({ title, sub, rows, good }: { title: string; sub: string; rows: Row[]; good: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      className={cn('zg-surface p-5 sm:p-6', good && 'ring-1 ring-zg-ok/40')}
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{sub}</p>
      <ol className="mt-5 space-y-3">
        {rows.map((r) => (
          <li key={r.time} className="flex gap-3">
            <span className="zg-num w-12 pt-0.5 text-sm font-semibold">{r.time}</span>
            <span
              className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', r.ok ? 'bg-zg-ok-soft text-zg-ok' : 'bg-zg-fail-soft text-zg-fail')}
            >
              {r.ok ? <Check className="size-3" strokeWidth={3} aria-label="接得上" /> : <X className="size-3" strokeWidth={3} aria-label="接不上" />}
            </span>
            <span className="text-sm">
              {r.text}
              <span className={cn('block text-xs', r.ok ? 'text-muted-foreground' : 'font-medium text-zg-fail')}>{r.note}</span>
            </span>
          </li>
        ))}
      </ol>
    </motion.div>
  )
}

/** 介紹頁第 3 區：左右對照的「失敗時間軸」 */
export function PainCompare() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">WHY ZEROGAP</p>
      <h2 className="mt-3 text-3xl font-bold sm:text-4xl cine:font-semibold lin:font-semibold">自己排，常常差那幾分鐘。</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Column title="自己查三個 App 拼起來" sub="電影、地圖、台鐵各查各的（示意）" rows={DIY} good={false} />
        <Column title="用 ZeroGap" sub="每一段先算好才給你" rows={ZG} good />
      </div>
    </section>
  )
}
