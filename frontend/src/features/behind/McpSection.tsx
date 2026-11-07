const TOOLS: [string, string, string][] = [
  ['list_areas', '列出可以排的商圈和 code', '助理不知道商圈 code 時，第一個呼叫'],
  ['search_locations', '把地址或地標換成出發位置', '使用者說「從我家出發」，要先換成座標'],
  ['list_stations', '某個縣市有哪些車站', '使用者說的是車站名，要找對應的站'],
  ['list_categories', '電影片型、料理類別的代碼', '使用者說「想吃日式」「看動作片」，要換成代碼'],
  ['data_coverage', '某商圈某一天有哪些電影、影廳、語言和料理', '排之前先確認那天有東西可排，也能回答「週五有哪些片」'],
  ['plan_date', '真的排出行程，回傳最多 3 個方案和 share_url', '條件都齊了才呼叫；約 1～3 分鐘，過程會回報進度'],
]

const FLOW = [
  ['助理呼叫 list_areas', '找出商圈的 code。'],
  ['呼叫 data_coverage', '查那一天有什麼電影和料理可以排。'],
  ['呼叫 plan_date', '送出條件：出發地、日期、人數、預算、想看想吃什麼。'],
  ['後端照網頁同一條路排程', '用 MCP 的進度通知回報：排隊順位、每個階段做到哪。'],
  ['回傳結果', '最多 3 個方案，加上 share_url。'],
  ['使用者點連結', '網站的 /p/編號 打開同一份行程。'],
]

/** 系統幕後 ④：MCP 工具和一次呼叫的流程（資料來自 backend/app/mcp.py） */
export function McpSection() {
  return (
    <section>
      <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">MCP</p>
      <h2 className="mt-2 text-2xl font-bold">MCP：同一份行程，AI 助理也拿得到</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        後端的 <code className="zg-num">/mcp</code> 提供六個工具。網頁和助理排出來的是同一種行程，Jev 排序、LLM 代選的規則也一樣。
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="zg-surface overflow-x-auto p-5">
          <h3 className="mb-3 font-semibold">六個工具</h3>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">MCP 工具：名稱、做什麼、什麼時候用</caption>
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="pb-2 pr-3 font-medium">名稱</th>
                <th scope="col" className="pb-2 pr-3 font-medium">做什麼</th>
                <th scope="col" className="pb-2 font-medium">什麼時候用</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([name, what, when]) => (
                <tr key={name} className="border-t align-top">
                  <th scope="row" className="zg-num py-2 pr-3 text-left font-medium">{name}</th>
                  <td className="py-2 pr-3">{what}</td>
                  <td className="py-2 text-muted-foreground">{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="zg-surface p-5">
          <h3 className="mb-3 font-semibold">一次呼叫的流程</h3>
          <ol className="space-y-3 text-sm">
            {FLOW.map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="zg-num flex size-6 shrink-0 items-center justify-center rounded-full border text-xs" aria-hidden="true">{i + 1}</span>
                <span>
                  <strong className="font-medium">{title}</strong>
                  <span className="text-muted-foreground">：{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        網頁和 MCP 共用同一個服務函式（<code className="zg-num">plan_stream</code>）、同樣的限流和排隊上限。
      </p>
    </section>
  )
}
