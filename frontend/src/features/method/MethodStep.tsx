import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

export function MethodStep({ n, title, fact, children }: { n: number; title: string; fact?: ReactNode; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      id={`method-${n}`}
      aria-labelledby={`method-${n}-title`}
      className="flex min-h-[70vh] scroll-mt-20 flex-col justify-center py-12"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <h2 id={`method-${n}-title`} className="text-2xl font-bold sm:text-3xl">{title}</h2>
      {fact && <div className="mt-4 text-4xl font-semibold text-primary sm:text-5xl">{fact}</div>}
      <div className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground">{children}</div>
    </motion.section>
  )
}
