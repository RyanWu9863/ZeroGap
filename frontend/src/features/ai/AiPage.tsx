import { useEffect, useRef, useState } from 'react'
import { USE_MOCK } from '@/api/client'
import { useDemoStore } from '@/store/demoStore'
import { writeClipboard } from '@/shared/lib/clipboard'
import { usePageTitle } from '@/shared/lib/usePageTitle'
import { claudeCodeCommand, mcpUrl } from './mcpUrl'

const EXAMPLES = [
  '週六晚上從中壢站出發，去中壢看電影吃日式，每人 800 以內，11 點前回到家。',
  '明天下午兩點後從桃園站出發，先吃飯再看電影，走路不要超過 8 分鐘。',
  '這週五晚上想在桃園區看 IMAX，有哪些片？',
]

const TOOLS: [string, string][] = [
  ['list_areas', '有哪些商圈可以排（目前只有桃園市）。'],
  ['search_locations', '把地址或地標換成出發位置。'],
  ['list_stations', '某個縣市有哪些車站。'],
  ['list_categories', '電影片型、料理類別的代碼。'],
  ['data_coverage', '某個商圈某一天有哪些電影、影廳、語言和可以吃的料理。'],
  ['plan_date', '真的排出行程（約 1～3 分鐘，過程中會回報進度），回傳最多 3 個方案和網站連結。'],
]

const LIMITS = [
  '只有桃園市的商圈。',
  '不能訂票，也不能只找餐廳不看電影。',
  '同一個網路每小時能排的次數有限，太多人同時排會排隊。',
  '資料是學術展示用。',
]

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    const ok = await writeClipboard(text)
    clearTimeout(timer.current)
    setState(ok ? 'done' : 'failed')
    if (ok) timer.current = setTimeout(() => setState('idle'), 2000)
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        {state === 'done' ? '已複製' : label}
      </button>
      {state === 'failed' && <span className="text-sm text-muted-foreground">請手動選取複製</span>}
    </span>
  )
}

const card = 'rounded-lg border border-border p-4'

export function AiPage() {
  usePageTitle('AI 助理')
  const demo = useDemoStore((s) => s.demo)
  const url = mcpUrl(
    { publicMcpUrl: import.meta.env.VITE_PUBLIC_MCP_URL, apiBase: import.meta.env.VITE_API_BASE, useMock: USE_MOCK || demo },
    window.location.origin,
  )
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">在 AI 助理裡使用 ZeroGap</h1>
      <p className="mt-3 leading-relaxed">
        如果你平常用支援 MCP 的 AI 助理（例如 Claude），可以把 ZeroGap 接進去，直接用說的排行程。助理排好會給你一個連結，打開就是網站上同一份行程，可以看錶盤、地圖、加到行事曆。
      </p>

      <h2 className="mt-10 text-xl font-semibold">可以這樣說</h2>
      <ul className="mt-4 space-y-3">
        {EXAMPLES.map((e) => (
          <li key={e} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <span className="min-w-0 flex-1 leading-relaxed">{e}</span>
            <CopyButton text={e} label="複製" />
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-semibold">怎麼接上</h2>
      <div className="mt-4 space-y-3">
        <div className={card}>
          <h3 className="font-medium">MCP 網址</h3>
          {url ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <code className="zg-num min-w-0 break-all select-all">{url}</code>
              <CopyButton text={url} label="複製網址" />
            </div>
          ) : (
            <p className="mt-2 leading-relaxed">
              這個展示站用的是示範資料，沒有接上真的後端，所以還不能從 AI 助理連進來。團隊把後端架起來以後，這裡會顯示網址。
            </p>
          )}
        </div>
        <div className={card}>
          <h3 className="font-medium">Claude 桌面版或網頁版</h3>
          <p className="mt-2 leading-relaxed">到設定的「連接器」新增自訂連接器，名稱填 ZeroGap，網址貼上上面那個。</p>
        </div>
        {url && (
          <div className={card}>
            <h3 className="font-medium">Claude Code</h3>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <code className="zg-num min-w-0 break-all select-all">{claudeCodeCommand(url)}</code>
              <CopyButton text={claudeCodeCommand(url)} label="複製指令" />
            </div>
          </div>
        )}
        <div className={card}>
          <h3 className="font-medium">其他支援 MCP 的助理</h3>
          <p className="mt-2 leading-relaxed">選「HTTP」或「Streamable HTTP」連線方式，貼上同一個網址，不需要金鑰。</p>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-semibold">助理會用到的工具</h2>
      <dl className="mt-4 space-y-3">
        {TOOLS.map(([name, desc]) => (
          <div key={name}>
            <dt><code className="zg-num">{name}</code></dt>
            <dd className="leading-relaxed">{desc}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-xl font-semibold">做不到的事</h2>
      <ul className="mt-4 list-disc space-y-1 pl-5 leading-relaxed">
        {LIMITS.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  )
}
