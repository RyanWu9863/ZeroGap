import type { ItineraryRequest, ItineraryResponse } from '@/api/schemas'

/** 系統幕後 ④⑤：給 Agent 的介面預覽（Q92）＋原始 JSON（Q65） */
export function AgentSection({ request, data }: { request: ItineraryRequest; data: ItineraryResponse }) {
  return (
    <div className="space-y-4">
      <div className="zg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">給 AI Agent 的介面</h3>
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">v2 規劃中</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          網頁用的就是這一份 API 合約：<code className="zg-num">POST /api/itineraries</code>，輸入 16 個欄位、輸出最多 3 個行程。
          v2 會把它包成 MCP 工具，讓任何 Agent 都能直接呼叫，畫面和 Agent 拿到的是同一份答案。
        </p>
      </div>
      <details className="zg-surface p-5">
        <summary className="cursor-pointer font-semibold">原始 JSON（這次送出的條件和收到的回應）</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">{JSON.stringify(request, null, 2)}</pre>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">{JSON.stringify(data, null, 2)}</pre>
        </div>
      </details>
    </div>
  )
}
