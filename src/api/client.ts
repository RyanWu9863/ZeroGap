import { itineraryNoSolution } from '@/mocks/itineraryNoSolution'
import { itineraryOk } from '@/mocks/itineraryOk'
import { optionsMock } from '@/mocks/options'
import { statusMock } from '@/mocks/status'
import { ItineraryResponse, OptionsResponse, StatusResponse, type ItineraryRequest } from './schemas'

/*
 * 跟後端溝通的唯一出入口（決策 Q11）。
 * VITE_USE_MOCK=true（預設）→ 用 src/mocks 的假資料；false → 打真的 /api。
 * 不論哪種來源，資料都先經過 zod「驗貨」才交給畫面。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

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
  if (USE_MOCK) {
    await wait(800)
    // 網址加 ?mock=no_solution 可以預覽無解畫面；預算放寬到 $800 以上就有解
    const wantsNoSolution = new URLSearchParams(window.location.search).get('mock') === 'no_solution'
    return ItineraryResponse.parse(wantsNoSolution && req.budget_per_person < 800 ? itineraryNoSolution : itineraryOk)
  }
  return ItineraryResponse.parse(await getJson('/api/itineraries', { method: 'POST', body: JSON.stringify(req) }))
}

export async function getStatus(): Promise<StatusResponse> {
  if (USE_MOCK) return StatusResponse.parse(statusMock)
  return StatusResponse.parse(await getJson('/api/status'))
}

/** 精靈的下拉選項；指定日期＋商圈時，只回傳那天那商圈有場次的電影（API.md §5.1） */
export async function getOptions(date?: string, districtId?: number): Promise<OptionsResponse> {
  if (USE_MOCK) {
    await wait(150)
    return OptionsResponse.parse(optionsMock(date))
  }
  const q = new URLSearchParams()
  if (date) q.set('date', date)
  if (districtId) q.set('district_id', String(districtId))
  return OptionsResponse.parse(await getJson(`/api/options?${q.toString()}`))
}
