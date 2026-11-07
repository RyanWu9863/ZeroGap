import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PlanResult } from '@/api/schemas'
import fixture from '@/api/__fixtures__/backend-plan-result.json'
import { useStatus } from '@/api/queries'
import { latestUpdate } from '@/app/latestUpdate'
import { BUFFER_LEVELS } from '@/shared/lib/config'
import { usePageTitle } from '@/shared/lib/usePageTitle'
import { MethodStep } from './MethodStep'
import { methodFacts } from './methodFacts'

// 這頁是延遲載入的，範例資料只進方法頁自己的包，不影響首頁
const facts = methodFacts(PlanResult.parse(fixture))

const fmt = (n: number) => n.toLocaleString()

/** 大字的數字：數字用 zg-num，單位和說明用小一點的字 */
function Num({ children }: { children: ReactNode }) {
  return <span className="zg-num">{children}</span>
}
function Unit({ children }: { children: ReactNode }) {
  return <span className="text-lg font-medium text-foreground sm:text-xl">{children}</span>
}
function Demo() {
  return <p className="mt-2 text-xs font-normal text-muted-foreground">示範：一次真的規劃結果</p>
}

const SHORT_TITLES = ['全部可能', '開演', '點餐', '走路', '回程', '預算', '留下', '緩衝', '查車', '資料']

function Timeline() {
  return (
    <svg viewBox="0 0 320 120" className="mt-2 w-full max-w-md" aria-hidden="true">
      <g stroke="currentColor" className="text-border" strokeWidth="2">
        <line x1="20" y1="30" x2="300" y2="30" />
        <line x1="20" y1="90" x2="300" y2="90" />
      </g>
      <g className="fill-primary">
        {[20, 140, 280].map((x) => <circle key={`a${x}`} cx={x} cy="30" r="6" />)}
        {[20, 140, 280].map((x) => <circle key={`b${x}`} cx={x} cy="90" r="6" />)}
      </g>
      <g className="fill-foreground" fontSize="12" textAnchor="middle">
        <text x="20" y="16">出門</text>
        <text x="140" y="16">最早到的那班</text>
        <text x="280" y="16">開演</text>
        <text x="20" y="116">散場</text>
        <text x="140" y="116">最晚走的那班</text>
        <text x="280" y="116">到家</text>
      </g>
    </svg>
  )
}

export function MethodPage() {
  usePageTitle('方法')
  const { data } = useStatus()
  const latest = latestUpdate(Object.values(data?.data_updated_at ?? {}))
  const { roomy, snug } = BUFFER_LEVELS

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:grid lg:grid-cols-[10rem_1fr] lg:gap-10">
      <ol aria-label="這一頁的段落" className="hidden text-sm lg:sticky lg:top-24 lg:block lg:self-start">
        {SHORT_TITLES.map((t, i) => (
          <li key={t}>
            <a href={`#method-${i}`} className="block border-l-2 py-1 pl-3 text-muted-foreground hover:border-primary hover:text-foreground">
              {t}
            </a>
          </li>
        ))}
      </ol>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-semibold tracking-tight">我們怎麼確定每一段都接得上</h1>
        <p className="mt-3 text-muted-foreground">每一個方案都要通過五道關卡。下面用一次真的規劃當例子，往下捲一關一關看。</p>

        <MethodStep
          n={0}
          title="先把所有可能都列出來"
          fact={<><Num>{fmt(facts.combinations)}</Num> <Unit>種組合</Unit><Demo /></>}
        >
          那天每一場電影 × 每一家餐廳 × 去回的每一班車，先全部列出來，再一關一關刪。
        </MethodStep>

        <MethodStep
          n={1}
          title="第一關：趕得上開演"
          fact={facts.showtimeBuffer !== null && <><Unit>開演前還有</Unit> <Num>{fmt(facts.showtimeBuffer)}</Num> <Unit>分</Unit><Demo /></>}
        >
          從出發點搭車、走到影城，要在開演前到。
          {facts.showtimeBuffer !== null && `這個例子走到影城時，離開演還有 ${fmt(facts.showtimeBuffer)} 分鐘。`}
        </MethodStep>

        <MethodStep
          n={2}
          title="第二關：趕得上點餐"
          fact={facts.lastOrderBuffer !== null && <><Unit>離最後點餐還有</Unit> <Num>{fmt(facts.lastOrderBuffer)}</Num> <Unit>分</Unit><Demo /></>}
        >
          散場後走到餐廳，要在最後點餐時間之前（先吃飯再看電影時，吃完也要趕得上開演）。
        </MethodStep>

        <MethodStep
          n={3}
          title="第三關：走路不超過上限"
          fact={facts.walkMinutes !== null && <><Unit>影城到餐廳走</Unit> <Num>{fmt(facts.walkMinutes)}</Num> <Unit>分</Unit><Demo /></>}
        >
          影城和餐廳之間的走路時間，不能超過你設定的上限。
        </MethodStep>

        <MethodStep
          n={4}
          title="第四關：趕得上回程車"
          fact={
            (facts.returnBuffer !== null || facts.homeBuffer !== null) && (
              <>
                {facts.returnBuffer !== null && <><Unit>離預定那班車還有</Unit> <Num>{fmt(facts.returnBuffer)}</Num> <Unit>分</Unit></>}
                {facts.returnBuffer !== null && facts.homeBuffer !== null && <Unit>；</Unit>}
                {facts.homeBuffer !== null && <><Unit>到家前還有</Unit> <Num>{fmt(facts.homeBuffer)}</Num> <Unit>分</Unit></>}
                <Demo />
              </>
            )
          }
        >
          最後要趕得上回程的車，並且在你說的時間前回到出發點。
        </MethodStep>

        <MethodStep
          n={5}
          title="第五關：不超過預算"
          fact={
            <>
              <Unit>每人</Unit> <Num>${fmt(facts.costTotal)}</Num>
              <p className="mt-1 text-base font-normal text-foreground sm:text-lg">
                電影 {fmt(facts.costParts.ticket)}、餐點 {fmt(facts.costParts.meal)}、車資 {fmt(facts.costParts.fares)}
              </p>
              <Demo />
            </>
          }
        >
          車資、電影票和一餐加起來，不超過你給的每人預算。
        </MethodStep>

        <MethodStep
          n={6}
          title="五關都過的才留下"
          fact={
            <>
              <Num>{fmt(facts.feasible)}</Num> <Unit>種每段都接得上</Unit> <Unit>→ 挑出</Unit> <Num>{fmt(facts.plans)}</Num> <Unit>個</Unit>
              <Demo />
            </>
          }
        >
          每一道關卡都只刪掉接不上的組合，所以留下來的每一個都保證接得上。我們不列每一關各刪了幾組，因為系統只記錄最後的結果。
        </MethodStep>

        <MethodStep
          n={7}
          title="緩衝怎麼算"
          fact={<><Unit>這個例子最緊的一段</Unit> <Num>{fmt(facts.minBuffer)}</Num> <Unit>分</Unit><Demo /></>}
        >
          緩衝＝你到的時間和「最晚可以到」之間差幾分鐘。{roomy} 分以上算寬鬆、{snug}～{roomy - 1} 分算剛好、少於 {snug} 分算偏緊。
        </MethodStep>

        <MethodStep n={8} title="為什麼要查最早到、最晚走的車" fact={<Timeline />}>
          去程只要最早到的那班趕得上就好；回程要知道最晚哪一班還回得去，才知道能玩多久。班次每次排行程時都即時查交通部的資料，不是用舊時刻表。
        </MethodStep>

        <MethodStep
          n={9}
          title="資料從哪來、多久更新"
          fact={
            latest && (
              <>
                <Unit>資料更新</Unit>{' '}
                <time dateTime={latest.toISOString()} className="zg-num">
                  {latest.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                </time>
              </>
            )
          }
        >
          電影場次：開眼電影網，每天更新；餐廳：OpenStreetMap 和 Google 地圖；車站和班次：交通部 TDX，班次每次即時查。
        </MethodStep>

        <div className="py-8">
          <Link to="/plan/1" className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
            用你的條件排一次
          </Link>
        </div>
      </div>
    </div>
  )
}
