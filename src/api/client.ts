import { mockGet, mockPlanResponse } from '@/mocks/server'
import { API_TIMEOUT_MS } from '@/shared/lib/config'
import { useDemoStore } from '@/store/demoStore'
import { ApiError, parseOrThrow } from './errors'
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
import { useTimingStore } from './timing'

/*
 * 跟後端溝通的唯一出入口（決策 Q11）。
 * VITE_USE_MOCK=true（預設）→ 用 src/mocks 的假後端；false → 打真的 /api。
 * 假後端也用同一套 SSE 格式回傳，所以拆串流的程式在假資料模式下一樣會跑到。
 * 不論哪種來源，資料都先經過 zod「驗貨」才交給畫面。
 * 出錯一律丟 ApiError，分成連不上／等太久／錯誤代碼／格式不對四種（計畫 P1-2，見 errors.ts）；
 * 後端回的錯誤代碼（規格書 6.1、6.4）是其中的「錯誤代碼」，用 PlanError 帶著 code。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

/** 這次要不要用假資料／錄製回應：開發開關或展示模式（Q69）任一打開就用 */
const mocking = () => USE_MOCK || useDemoStore.getState().demo

const base = () => import.meta.env.VITE_API_BASE ?? ''

/** 後端回的錯誤（HTTP 錯誤或 SSE 的 error 事件）。code 照規格書 6.1、6.4 */
export class PlanError extends ApiError {
  readonly code: string
  readonly reasons: Record<string, number> | null
  /** 秒；429、503 會附 Retry-After */
  readonly retryAfter: number | null
  constructor(body: { code: string; message?: string; reasons?: Record<string, number> | null }, status: number | null = null, retryAfter: number | null = null) {
    super('http', body.message || body.code, status ?? undefined)
    this.name = 'PlanError'
    this.code = body.code
    this.reasons = body.reasons ?? null
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

/**
 * fetch 加上逾時，連不上、等太久分開報（計畫 P1-2）。
 * signal 是呼叫端的取消（TanStack Query 離開頁面、規劃被取消）：那種取消照原樣丟出去，不算錯誤。
 */
async function send(path: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const { timeoutMs, signal, ...rest } = init
  const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : null
  // 舊瀏覽器沒有 AbortSignal.any 就只用逾時
  const combined = timeout && signal && 'any' in AbortSignal ? AbortSignal.any([signal, timeout]) : (timeout ?? signal)
  try {
    return await fetch(`${base()}${path}`, { ...rest, signal: combined })
  } catch (e) {
    if (timeout?.aborted) throw new ApiError('timeout', `API ${path} 超過 ${timeoutMs! / 1000} 秒沒有回應`)
    if (signal?.aborted) throw e
    throw new ApiError('network', `API ${path} 連不上`)
  }
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  if (mocking()) return mockGet(path, signal)
  const res = await send(path, { signal, timeoutMs: API_TIMEOUT_MS.default })
  if (!res.ok) throw await toError(res)
  try {
    return await res.json()
  } catch {
    throw new ApiError('format', `API ${path} 回傳的不是 JSON`)
  }
}

export const getCounties = async (signal?: AbortSignal) => parseOrThrow(CountiesResponse, await getJson('/api/counties', signal), '縣市')
export const getAreas = async (county: string, signal?: AbortSignal) =>
  parseOrThrow(AreasResponse, await getJson(`/api/areas?county=${encodeURIComponent(county)}`, signal), '商圈')
export const getStations = async (county: string, signal?: AbortSignal) =>
  parseOrThrow(StationsResponse, await getJson(`/api/stations?county=${encodeURIComponent(county)}`, signal), '車站')
export const getCategories = async (kind: 'movie_genre' | 'cuisine', signal?: AbortSignal) =>
  parseOrThrow(CategoriesResponse, await getJson(`/api/categories?kind=${kind}`, signal), '類別')
export const getStatus = async (signal?: AbortSignal) => parseOrThrow(StatusResponse, await getJson('/api/status', signal), '系統狀態')

/** 有場次的日期；帶日期時另外列出當天的電影、片型、影廳、語言 */
export async function getCoverage(area: string, date?: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ area })
  if (date) q.set('date', date)
  return parseOrThrow(CoverageResponse, await getJson(`/api/coverage?${q.toString()}`, signal), '場次範圍')
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
 * - 規劃本來就要 1～3 分鐘，所以串流不設逾時；只有「開始連線」設逾時
 * - 順便記下瀏覽器實測的「送出 → 收到」時間（系統幕後的決策時間軸用，見 timing.ts）
 */
export async function postPlan(req: PlanRequest, opts: { signal?: AbortSignal; onEvent?: (e: PlanEvent) => void } = {}): Promise<PlanResult> {
  const sentAt = Date.now()
  const t0 = performance.now()
  const source = mocking() ? 'mock' : 'api'
  const result = await streamPlan(req, opts)
  useTimingStore.getState().record(req, { sentAt, ms: Math.round(performance.now() - t0), source })
  return result
}

async function streamPlan(req: PlanRequest, opts: { signal?: AbortSignal; onEvent?: (e: PlanEvent) => void }): Promise<PlanResult> {
  const res = mocking()
    ? await mockPlanResponse(req, opts.signal)
    : await send('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(req),
        signal: opts.signal,
        timeoutMs: API_TIMEOUT_MS.connect,
      })
  if (!res.ok) throw await toError(res)
  if (!res.body) throw new PlanError({ code: 'STREAM_CLOSED', message: '沒有收到串流' })

  const data = (raw: string, what: string) => {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      throw new ApiError('format', `${what}不是 JSON`)
    }
  }
  try {
    for await (const e of readSse(res.body)) {
      if (e.event === 'queued') opts.onEvent?.({ type: 'queued', data: parseOrThrow(QueuedEvent, data(e.data, '排隊事件'), '排隊事件') })
      else if (e.event === 'progress') opts.onEvent?.({ type: 'progress', data: parseOrThrow(ProgressEvent, data(e.data, '進度事件'), '進度事件') })
      else if (e.event === 'result') return parseOrThrow(PlanResult, data(e.data, '規劃結果'), '規劃結果')
      else if (e.event === 'error') throw new PlanError(parseOrThrow(PlanErrorBody, data(e.data, '錯誤事件'), '錯誤事件'))
      // 其他事件名稱（後端之後加的）先忽略
    }
  } catch (e) {
    // 串流中途斷線（不是使用者取消）算「連不上」
    if (e instanceof ApiError || opts.signal?.aborted) throw e
    throw new ApiError('network', '連線在結果送達前中斷了')
  }
  throw new PlanError({ code: 'STREAM_CLOSED', message: '連線在結果送達前中斷了' })
}
