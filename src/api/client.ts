import { itineraryLowConfidence } from '@/mocks/itineraryLowConfidence'
import { itineraryNoSolution } from '@/mocks/itineraryNoSolution'
import { itineraryOk } from '@/mocks/itineraryOk'
import { optionsMock } from '@/mocks/options'
import { statusMock } from '@/mocks/status'
import { useDemoStore } from '@/store/demoStore'
import { ItineraryResponse, OptionsResponse, PICK_FOR_ME, StatusResponse, type ItineraryRequest } from './schemas'

/*
 * 跟後端溝通的唯一出入口（決策 Q11）。
 * VITE_USE_MOCK=true（預設）→ 用 src/mocks 的假資料；false → 打真的 /api。
 * 不論哪種來源，資料都先經過 zod「驗貨」才交給畫面。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

/** 這次要不要用假資料／錄製回應：開發開關或展示模式（Q69）任一打開就用 */
const mocking = () => USE_MOCK || useDemoStore.getState().demo

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${import.meta.env.VITE_API_BASE ?? ''}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(`API ${path} 回傳 ${res.status}`)
  return res.json()
}

export async function postItineraries(req: ItineraryRequest): Promise<ItineraryResponse> {
  if (mocking()) {
    await wait(800)
    // 網址加 ?mock=no_solution：預算 $800 以下無解；?mock=low_confidence：「幫我挑」時系統拿不定
    const scenario = new URLSearchParams(window.location.search).get('mock')
    if (scenario === 'no_solution' && req.budget_per_person < 800) return ItineraryResponse.parse(itineraryNoSolution)
    if (scenario === 'low_confidence' && req.movie_title === PICK_FOR_ME) return ItineraryResponse.parse(itineraryLowConfidence)
    return ItineraryResponse.parse(itineraryOk)
  }
  return ItineraryResponse.parse(await getJson('/api/itineraries', { method: 'POST', body: JSON.stringify(req) }))
}

export async function getStatus(): Promise<StatusResponse> {
  if (mocking()) return StatusResponse.parse(statusMock)
  return StatusResponse.parse(await getJson('/api/status'))
}

/** 精靈的下拉選項；指定日期＋商圈時，只回傳那天那商圈有場次的電影（API.md §5.1） */
export async function getOptions(date?: string, districtId?: number): Promise<OptionsResponse> {
  if (mocking()) {
    await wait(150)
    return OptionsResponse.parse(optionsMock(date))
  }
  const q = new URLSearchParams()
  if (date) q.set('date', date)
  if (districtId) q.set('district_id', String(districtId))
  return OptionsResponse.parse(await getJson(`/api/options?${q.toString()}`))
}
