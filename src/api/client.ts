import { itineraryOk } from '@/mocks/itineraryOk'
import { statusMock } from '@/mocks/status'
import { ItineraryResponse, StatusResponse, type ItineraryRequest } from './schemas'

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
    return ItineraryResponse.parse(itineraryOk)
  }
  return ItineraryResponse.parse(await getJson('/api/itineraries', { method: 'POST', body: JSON.stringify(req) }))
}

export async function getStatus(): Promise<StatusResponse> {
  if (USE_MOCK) return StatusResponse.parse(statusMock)
  return StatusResponse.parse(await getJson('/api/status'))
}
