import type { PlanRequest, PlanResult } from '@/api/schemas'

/** 系統幕後 ④⑤：給 Agent 的介面（Q92；規格書 6.6）＋原始 JSON（Q65） */
export function AgentSection({ request, data }: { request: PlanRequest; data: PlanResult }) {
  return (
    <div className="space-y-4">
      <div className="zg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">給 AI Agent 的介面</h3>
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">MCP 已提供</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          網頁送出條件用的是 <code className="zg-num">POST /api/plans</code>，回應是 SSE 串流：排隊順位、每個階段的進度，最後是最多 3 個行程。
          後端在 <code className="zg-num">/mcp</code> 提供 MCP 工具 <code className="zg-num">plan_date</code>，跟網頁共用同一個服務函式：
          Agent 收到的進度通知和答案，跟畫面上看到的是同一份。
        </p>
      </div>
      <details className="zg-surface p-5">
        <summary className="cursor-pointer font-semibold">原始 JSON（這次送出的條件和收到的 result 事件）</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">{JSON.stringify(request, null, 2)}</pre>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">{JSON.stringify(data, null, 2)}</pre>
        </div>
      </details>
    </div>
  )
}
