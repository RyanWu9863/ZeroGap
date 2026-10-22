import { itineraryLowConfidence } from '@/mocks/itineraryLowConfidence'
import { itineraryNoSolution } from '@/mocks/itineraryNoSolution'
import { optionsMock } from '@/mocks/options'
import { pickItinerary } from '@/mocks/pickItinerary'
import { statusMock } from '@/mocks/status'
import { API_TIMEOUT_MS } from '@/shared/lib/config'
import { useDemoStore } from '@/store/demoStore'
import { ApiError, parseOrThrow } from './errors'
import { ItineraryResponse, OptionsResponse, PICK_FOR_ME, StatusResponse, type ItineraryRequest } from './schemas'

/*
 * 跟後端溝通的唯一出入口（決策 Q11）。
 * VITE_USE_MOCK=true（預設）→ 用 src/mocks 的假資料；false → 打真的 /api。
 * 不論哪種來源，資料都先經過 zod「驗貨」才交給畫面。
 * 出錯一律丟 ApiError，分成連不上／等太久／錯誤代碼／格式不對四種（計畫 P1-2，見 errors.ts）。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

/** 這次要不要用假資料／錄製回應：開發開關或展示模式（Q69）任一打開就用 */
const mocking = () => USE_MOCK || useDemoStore.getState().demo

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 網址上的假資料情境（?mock=…），只在假資料模式有效 */
const mockScenario = () => new URLSearchParams(window.location.search).get('mock')

type JsonInit = RequestInit & { timeoutMs?: number }

async function getJson(path: string, { timeoutMs = API_TIMEOUT_MS.default, signal, ...init }: JsonInit = {}): Promise<unknown> {
  // 自己的逾時，加上 TanStack Query 的取消訊號（離開頁面時取消）；舊瀏覽器沒有 AbortSignal.any 就只用逾時
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal && 'any' in AbortSignal ? AbortSignal.any([signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(`${import.meta.env.VITE_API_BASE ?? ''}${path}`, {
      ...init,
      signal: combined,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (e) {
    if (timeout.aborted) throw new ApiError('timeout', `API ${path} 超過 ${timeoutMs / 1000} 秒沒有回應`)
    if (signal?.aborted) throw e // 使用者離開頁面造成的取消，交給 TanStack Query 處理
    throw new ApiError('network', `API ${path} 連不上`)
  }
  if (!res.ok) throw new ApiError('http', `API ${path} 回傳 ${res.status}`, res.status)
  try {
    return await res.json()
  } catch {
    throw new ApiError('format', `API ${path} 回傳的不是 JSON`)
  }
}

export async function postItineraries(req: ItineraryRequest, signal?: AbortSignal): Promise<ItineraryResponse> {
  if (mocking()) {
    await wait(800)
    // 網址加 ?mock=no_solution：預算 $800 以下無解；?mock=low_confidence：「幫我挑」時系統拿不定
    const scenario = mockScenario()
    if (scenario === 'no_solution' && req.budget_per_person < 800) return parseOrThrow(ItineraryResponse, itineraryNoSolution, '行程')
    if (scenario === 'low_confidence' && req.movie_title === PICK_FOR_ME) return parseOrThrow(ItineraryResponse, itineraryLowConfidence, '行程')
    // 其他情況：挑條件對得上的那組（情境卡 ①②③），對不上就用基準那組
    return parseOrThrow(ItineraryResponse, pickItinerary(req), '行程')
  }
  const body = await getJson('/api/itineraries', { method: 'POST', body: JSON.stringify(req), signal, timeoutMs: API_TIMEOUT_MS.itineraries })
  return parseOrThrow(ItineraryResponse, body, '行程')
}

export async function getStatus(signal?: AbortSignal): Promise<StatusResponse> {
  if (mocking()) return parseOrThrow(StatusResponse, statusMock, '系統狀態')
  return parseOrThrow(StatusResponse, await getJson('/api/status', { signal }), '系統狀態')
}

/**
 * ?mock=options_error：選項前 2 次都失敗（第一次＋自動重試），之後按「重試」就成功。
 * 用來檢查「載入失敗」畫面，不用真的把後端關掉（計畫 P1-1）。
 */
let optionsFailLeft = 2

/** 精靈的下拉選項；指定日期＋商圈時，只回傳那天那商圈有場次的電影（API.md §5.1） */
export async function getOptions(date?: string, districtId?: number, signal?: AbortSignal): Promise<OptionsResponse> {
  if (mocking()) {
    await wait(150)
    // 和真的 fetch 一樣：被取消的請求（例如開發模式 React 重掛一次）算取消，不算失敗
    if (signal?.aborted) throw new DOMException('取消', 'AbortError')
    if (mockScenario() === 'options_error' && optionsFailLeft > 0) {
      optionsFailLeft--
      throw new ApiError('network', '假資料情境：選項載入失敗')
    }
    return parseOrThrow(OptionsResponse, optionsMock(date), '選項')
  }
  const q = new URLSearchParams()
  if (date) q.set('date', date)
  if (districtId) q.set('district_id', String(districtId))
  return parseOrThrow(OptionsResponse, await getJson(`/api/options?${q.toString()}`, { signal }), '選項')
}
