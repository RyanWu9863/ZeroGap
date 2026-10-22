import type { PlanRequest } from '@/api/schemas'
import { areas, categories, counties, coverage, stations, status } from './catalog'
import { mockResult } from './planResult'

/*
 * 假後端（VITE_USE_MOCK=true、展示模式、GitHub Pages 展示版用）。
 * 回應格式和真的後端一樣，POST /api/plans 也是一段一段送出的 SSE 串流，
 * 所以前端拆串流、顯示進度的程式在假資料模式下一樣會跑到。
 *
 * 網址加 ?mock=… 可以預覽特殊情境：
 *   no_solution     預算 $800 以下時無解（NO_FEASIBLE）
 *   low_confidence  系統拿不定：第 1 案的電影、餐廳和第 2 案的回程路線附備選
 *   no_showtimes    沒有符合條件的場次
 *   queue_full      排隊已滿（HTTP 503）
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const scenario = () => new URLSearchParams(window.location.search).get('mock')

export async function mockGet(path: string): Promise<unknown> {
  await wait(120)
  const url = new URL(path, 'http://mock')
  const q = (k: string) => url.searchParams.get(k)
  switch (url.pathname) {
    case '/api/counties':
      return counties
    case '/api/areas':
      return q('county') === 'Taoyuan' ? areas : []
    case '/api/stations':
      return q('county') === 'Taoyuan' ? stations : []
    case '/api/categories':
      return categories[q('kind') as keyof typeof categories] ?? []
    case '/api/coverage':
      return coverage(q('area') ?? '', q('date'))
    case '/api/status':
      return status()
  }
  throw new Error(`假後端沒有 ${path}`)
}

type Frame = [delayMs: number, event: string, data: unknown]

/** 這次要依序送出的事件（相隔的毫秒數、事件名稱、內容） */
function frames(req: PlanRequest): Frame[] {
  const s = scenario()
  const head: Frame[] = [
    [0, 'queued', { job_id: 'mock-job', position: 2 }],
    [300, 'queued', { job_id: 'mock-job', position: 1 }],
    [300, 'progress', { stage: 'loading_data' }],
  ]
  if (s === 'no_showtimes') return [...head, [300, 'error', { code: 'NO_SHOWTIMES', message: '沒有符合條件的場次' }]]
  const filtering: Frame[] = [
    [250, 'progress', { stage: 'checking_feasibility' }],
    [300, 'progress', { stage: 'filtering', combinations: 1880 }],
  ]
  if (s === 'no_solution' && req.budget_per_person < 800) {
    return [
      ...head,
      ...filtering,
      [300, 'progress', { stage: 'filtering', combinations: 1880, feasible: 0 }],
      // 各條件排除的組合數（加起來是 1880）；預算最緊，所以排第一
      [300, 'error', { code: 'NO_FEASIBLE', message: '沒有接得上的組合', reasons: { budget: 1210, last_train: 420, walk: 160, showtime: 90 } }],
    ]
  }
  const low = s === 'low_confidence'
  return [
    ...head,
    ...filtering,
    [300, 'progress', { stage: 'filtering', combinations: 1880, feasible: 39 }],
    [250, 'progress', { stage: 'choosing' }],
    ...(low ? ([[200, 'progress', { stage: 'llm_fallback' }]] as Frame[]) : []),
    [200, 'progress', { stage: 'verifying_hours' }],
    [200, 'progress', { stage: 'routing' }],
    [200, 'progress', { stage: 'building_result' }],
    [200, 'result', mockResult(req, low)],
  ]
}

/** 兩點的直線距離（公里），判斷目前位置是不是離商圈太遠 */
function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

const json400 = (message: string) =>
  new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message } }), { status: 400, headers: { 'Content-Type': 'application/json' } })

/** 模擬 POST /api/plans：回傳一個會慢慢送出 SSE 的 Response；signal 中斷就停 */
export async function mockPlanResponse(req: PlanRequest, signal?: AbortSignal): Promise<Response> {
  await wait(100)
  // 目前位置離商圈超過 30 公里，跟後端一樣回 400（規格書 6.4；假資料一律用桃園站當商圈的代表點）
  if (req.origin_lat != null && req.origin_lng != null && km(req.origin_lat, req.origin_lng, 24.989, 121.314) > 30) {
    return json400('目前位置離這個商圈超過 30 公里，請改選出發站')
  }
  if (scenario() === 'queue_full') {
    return new Response(JSON.stringify({ error: { code: 'QUEUE_FULL', message: '規劃佇列已滿' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    })
  }
  const enc = new TextEncoder()
  const timers: ReturnType<typeof setTimeout>[] = []
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let t = 0
      for (const [delay, event, data] of frames(req)) {
        t += delay
        // 先送心跳註解，事件再從位元組中間切成兩半送（可能切在中文字中間）：確認拆串流的程式不怕被切斷
        const bytes = enc.encode(`: ping\n\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        const cut = Math.floor(bytes.length / 2) + 1
        timers.push(setTimeout(() => controller.enqueue(bytes.slice(0, cut)), t))
        timers.push(setTimeout(() => controller.enqueue(bytes.slice(cut)), t + 10))
      }
      timers.push(setTimeout(() => controller.close(), t + 30))
      signal?.addEventListener('abort', () => {
        timers.forEach(clearTimeout)
        controller.error(new DOMException('已取消', 'AbortError'))
      })
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' } })
}
