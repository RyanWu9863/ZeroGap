import { ArrowRight } from 'lucide-react'

const PIPELINE = ['你的條件（16 欄）', 'SQL 粗篩候選', '五道關卡（Python）', 'Jev 排序＋閥門 0.60', '時間軸組裝', '三個方案']

const PILLARS = [
  { n: '01', title: 'Python 算時間與金額', body: '開演、點餐、走路、回程車、預算，全部由確定性程式計算。同樣的輸入永遠得到同樣的答案，不會「幻覺」。' },
  { n: '02', title: 'Jev 只負責排序', body: '在已經確定接得上的行程裡，用機率挑出最適合的 3 個。信心不足（低於 0.60）時不硬選，改問使用者。' },
  { n: '03', title: '給 Agent 的接口（v2）', body: '同一份 API 合約，之後包成 MCP 工具，任何 AI Agent 都能呼叫 ZeroGap 排行程。' },
]

/** 系統幕後 ①：方法＋架構圖（Q65）。對應楊老師的三個亮點：Jev＋LLM／Application／MCP。 */
export function MethodSection() {
  return (
    <section>
      <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">HOW IT WORKS</p>
      <h2 className="mt-2 text-2xl font-bold cine:font-semibold lin:font-semibold">數字交給程式，選擇交給機率。</h2>
      <ol className="mt-6 flex flex-wrap items-center gap-2 text-xs" aria-label="系統流程">
        {PIPELINE.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="zg-surface px-3 py-2">{step}</span>
            {i < PIPELINE.length - 1 && <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.n} className="zg-surface p-5">
            <span className="zg-num text-2xl font-semibold text-zg-ok cine:text-primary lin:text-primary">{p.n}</span>
            <h3 className="mt-2 font-semibold">{p.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
