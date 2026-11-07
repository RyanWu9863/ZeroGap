import { ArrowRight } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Link } from 'react-router'

const STEPS = [
  { n: '01', title: '選條件', body: '商圈、出發站、日期、預算，上面四格點完就能排；想細調時間、電影、料理，再用四步精靈。都不用打字。' },
  { n: '02', title: '篩掉接不上的', body: '每一種組合都過五道關卡：趕得上開演、趕得上點餐、走路不超過上限、趕得上回程車、不超過預算。' },
  { n: '03', title: '拿到完整時間軸', body: '三個方案任你挑：幾點出門、看哪場、吃哪家、幾點回到車站、每人多少錢，一眼看完。' },
]

/**
 * 「開始規劃」帶回上面的四格快速條件（同一頁只有一個「開始」的地方），捲過去並把焦點放在第一格；
 * 想填更多條件的人走旁邊的「或用四步精靈規劃」。
 */
function goQuickForm(e: MouseEvent<HTMLAnchorElement>) {
  const title = document.getElementById('quick-title')
  if (!title) return // 找不到四格（不該發生）就照一般錨點跳
  e.preventDefault()
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  title.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  title.closest('section')?.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true })
}

/** 介紹頁第 4、5 區：三步驟＋再一次開始規劃 */
export function ThreeSteps() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">HOW IT WORKS</p>
      <h2 className="mt-3 text-3xl font-bold sm:text-4xl">三步，拿到接得上的行程。</h2>
      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className="zg-surface p-6">
            <span className="zg-num text-3xl font-semibold text-zg-ok">{s.n}</span>
            <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-14 flex flex-col items-center gap-4 text-center">
        <p className="text-xl font-semibold">今晚要去哪？</p>
        <a
          href="#quick-title"
          onClick={goQuickForm}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-base font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          開始規劃 <ArrowRight className="size-4" aria-hidden="true" />
        </a>
        <Link to="/plan/1" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          或用四步精靈規劃
        </Link>
      </div>
    </section>
  )
}
