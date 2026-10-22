import { mockGet, mockPlanResponse } from '@/mocks/server'
import { useDemoStore } from '@/store/demoStore'
import {
  AreasResponse,
  CategoriesResponse,
  CountiesResponse,
  CoverageResponse,
  PlanErrorBody,
  PlanResult,
  ProgressEvent,
  QueuedEvent,
  StationsResponse,
  StatusResponse,
  type PlanRequest,
} from './schemas'
import { readSse } from './sse'

/*
 * 跟後端溝通的唯一出入口（決策 Q11）。
 * VITE_USE_MOCK=true（預設）→ 用 src/mocks 的假後端；false → 打真的 /api。
 * 假後端也用同一套 SSE 格式回傳，所以拆串流的程式在假資料模式下一樣會跑到。
 * 不論哪種來源，資料都先經過 zod「驗貨」才交給畫面。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

/** 這次要不要用假資料／錄製回應：開發開關或展示模式（Q69）任一打開就用 */
const mocking = () => USE_MOCK || useDemoStore.getState().demo

const base = () => import.meta.env.VITE_API_BASE ?? ''

/** 後端回的錯誤（HTTP 錯誤或 SSE 的 error 事件）。code 照規格書 6.1、6.4 */
export class PlanError extends Error {
  readonly code: string
  readonly reasons: Record<string, number> | null
  /** 秒；429、503 會附 Retry-After */
  readonly retryAfter: number | null
  readonly status: number | null
  constructor(body: { code: string; message?: string; reasons?: Record<string, number> | null }, status: number | null = null, retryAfter: number | null = null) {
    super(body.message || body.code)
    this.name = 'PlanError'
    this.code = body.code
    this.reasons = body.reasons ?? null
    this.status = status
    this.retryAfter = retryAfter
  }
}

const retryAfterOf = (res: Response) => {
  const v = Number(res.headers.get('Retry-After'))
  return Number.isFinite(v) && v > 0 ? v : null
}

/** 把非 2xx 的回應轉成 PlanError；後端格式是 {"error": {"code", "message"}} */
async function toError(res: Response): Promise<PlanError> {
  const json = (await res.json().catch(() => null)) as { error?: unknown } | null
  const body = PlanErrorBody.safeParse(json?.error)
  return new PlanError(body.success ? body.data : { code: `HTTP_${res.status}` }, res.status, retryAfterOf(res))
}

async function getJson(path: string): Promise<unknown> {
  if (mocking()) return mockGet(path)
  const res = await fetch(`${base()}${path}`)
  if (!res.ok) throw await toError(res)
  return res.json()
}

export const getCounties = async () => CountiesResponse.parse(await getJson('/api/counties'))
export const getAreas = async (county: string) => AreasResponse.parse(await getJson(`/api/areas?county=${encodeURIComponent(county)}`))
export const getStations = async (county: string) => StationsResponse.parse(await getJson(`/api/stations?county=${encodeURIComponent(county)}`))
export const getCategories = async (kind: 'movie_genre' | 'cuisine') => CategoriesResponse.parse(await getJson(`/api/categories?kind=${kind}`))
export const getStatus = async () => StatusResponse.parse(await getJson('/api/status'))

/** 有場次的日期；帶日期時另外列出當天的電影、片型、影廳、語言 */
export async function getCoverage(area: string, date?: string) {
  const q = new URLSearchParams({ area })
  if (date) q.set('date', date)
  return CoverageResponse.parse(await getJson(`/api/coverage?${q.toString()}`))
}

export type PlanEvent =
  | { type: 'queued'; data: QueuedEvent }
  | { type: 'progress'; data: ProgressEvent }

/**
 * 送出規劃，讀 SSE 直到收到 result 或 error（規格書 6.4）。
 * - 進度（queued、progress）交給 onEvent
 * - 成功回傳完整結果；失敗丟 PlanError（無解也是，code 是 NO_FEASIBLE 或 NO_SHOWTIMES）
 * - 串流開始前後端也可能直接回 JSON 錯誤：409、429、503
 * - signal 中斷＝使用者離開，後端會取消這個工作
 */
export async function postPlan(req: PlanRequest, opts: { signal?: AbortSignal; onEvent?: (e: PlanEvent) => void } = {}): Promise<PlanResult> {
  const res = mocking()
    ? await mockPlanResponse(req, opts.signal)
    : await fetch(`${base()}/api/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(req),
        signal: opts.signal,
      })
  if (!res.ok) throw await toError(res)
  if (!res.body) throw new PlanError({ code: 'STREAM_CLOSED', message: '沒有收到串流' })

  for await (const e of readSse(res.body)) {
    if (e.event === 'queued') opts.onEvent?.({ type: 'queued', data: QueuedEvent.parse(JSON.parse(e.data)) })
    else if (e.event === 'progress') opts.onEvent?.({ type: 'progress', data: ProgressEvent.parse(JSON.parse(e.data)) })
    else if (e.event === 'result') return PlanResult.parse(JSON.parse(e.data))
    else if (e.event === 'error') throw new PlanError(PlanErrorBody.parse(JSON.parse(e.data)))
    // 其他事件名稱（後端之後加的）先忽略
  }
  throw new PlanError({ code: 'STREAM_CLOSED', message: '連線在結果送達前中斷了' })
}
