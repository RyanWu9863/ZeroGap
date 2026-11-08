import { lazy, Suspense, useEffect, useState } from 'react'
import { USE_MOCK } from '@/api/client'
import { resolveTheme, useSystemDark, useThemeStore } from '@/shared/theme/theme'
import { useHeroStats } from './heroStats'

const DotField = lazy(() => import('./DotField'))

/** 點陣載入前先佔好同樣的高度（畫布＋下面那行小字，跟 DotField 一樣：手機 h-40、sm 以上 h-72），載入後版面不跳 */
function DotFieldPlaceholder() {
  return (
    <div aria-hidden>
      <div className="h-40 sm:h-72" />
      <div className="mt-2 h-4" />
    </div>
  )
}

const fmt = (n: number) => n.toLocaleString('zh-TW')

/** 數字之間的箭頭：螢幕閱讀器念成逗號，不念「右箭頭」 */
function Arrow() {
  return (
    <>
      <span aria-hidden className="mx-2 font-normal text-muted-foreground sm:mx-3">
        →
      </span>
      <span className="sr-only">，</span>
    </>
  )
}

/** 首頁首屏（規格 4.2）：標題＋三個大數字（全部組合 → 接得上 → 給你）＋點陣剪枝動畫 */
export function HomeHero() {
  const stats = useHeroStats()
  const theme = resolveTheme(useThemeStore((s) => s.pref), useSystemDark())
  // 點陣等標題畫出來、瀏覽器有空時才載入，不跟 LCP 搶時間
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const go = () => setReady(true)
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(go, { timeout: 1000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(go, 200) // Safari 沒有 requestIdleCallback；晚一點再載，不跟 LCP 搶
    return () => clearTimeout(id)
  }, [])

  const when =
    stats.finishedAt === null
      ? null
      : new Date(stats.finishedAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  // 假後端排出來的數字是編的，不能當成「你上次排的」真數字（手機上看不到「假資料」徽章，這裡自己標）
  const notes = [USE_MOCK ? '假資料' : null, when].filter(Boolean).join('，')
  const caption = stats.sample ? '示範：一次真實後端規劃的數字' : notes ? `你上次排的（${notes}）` : '你上次排的'

  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-20">
      <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">ZERO GAP · 零空檔</p>
      {/* LCP 元素：不淡入，一開始就看得到 */}
      <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
        電影、晚餐、回家的車，
        <br />
        <span className="text-zg-flow">每一段都接得上。</span>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">填四個條件，系統把當天所有場次和餐廳交叉比對，只留下時間真的接得起來的行程。</p>

      <p className="zg-figure mt-10 text-3xl leading-tight sm:text-5xl">
        <span className="whitespace-nowrap">
          {fmt(stats.combinations)} <span className="text-base font-medium sm:text-xl">種組合</span>
        </span>
        <Arrow />
        <span className="whitespace-nowrap">
          {fmt(stats.feasible)} <span className="text-base font-medium sm:text-xl">種每段接得上</span>
        </span>
        <Arrow />
        <span className="whitespace-nowrap text-zg-flow">
          {fmt(stats.plans)} <span className="text-base font-medium sm:text-xl">個給你</span>
        </span>
      </p>
      <p className="mt-3 text-sm text-muted-foreground">{caption}</p>

      <div className="mt-8">
        {ready ? (
          <Suspense fallback={<DotFieldPlaceholder />}>
            <DotField stats={stats} theme={theme} />
          </Suspense>
        ) : (
          <DotFieldPlaceholder />
        )}
      </div>
    </section>
  )
}
