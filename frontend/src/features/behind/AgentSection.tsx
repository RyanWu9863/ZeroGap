import type { PlanRequest, PlanResult } from '@/api/schemas'

/** 系統幕後 ⑥：原始 JSON（Q65）。示範範例沒有保存當時送出的條件，request 是 null。 */
export function AgentSection({ request, data }: { request: PlanRequest | null; data: PlanResult }) {
  return (
    <div>
      <details className="zg-surface p-5">
        <summary className="cursor-pointer font-semibold">原始 JSON（這次送出的條件和收到的 result 事件）</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {request ? (
            <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">{JSON.stringify(request, null, 2)}</pre>
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">示範範例沒有保存當時送出的條件</p>
          )}
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">{JSON.stringify(data, null, 2)}</pre>
        </div>
      </details>
    </div>
  )
}
