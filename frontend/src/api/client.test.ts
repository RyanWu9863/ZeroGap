import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from './__fixtures__/backend-plan-result.json'
import type { PlanRequest } from './schemas'

/*
 * 接真後端時的 postPlan（VITE_USE_MOCK=false）：用假的 fetch 回 SSE 或 JSON 錯誤。
 * USE_MOCK 在載入時就決定，所以每個測試重新載入 client.ts。
 */
const req: PlanRequest = {
  area: 'zhongli', origin_station_id: 49, origin_lat: null, origin_lng: null, date: '2026-10-21', earliest_departure: '17:30', latest_home: '23:30', order: 'movie_first',
  movie_id: null, movie_genre: null, hall_type: null, language: null, cuisine: null, budget_per_person: 1500, max_walk_minutes: 15,
}

const sse = (...frames: [string, unknown][]) => {
  const text = frames.map(([e, d]) => `: ping\n\nevent: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('')
  const bytes = new TextEncoder().encode(text)
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        // 每 7 個位元組送一段，確認被切斷也拆得對
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7))
        c.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

async function load() {
  vi.resetModules()
  vi.stubEnv('VITE_USE_MOCK', 'false')
  return import('./client')
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('postPlan（規格書 6.4）', () => {
  it('收到 queued、progress，最後回傳 result（後端實際的回應）', async () => {
    const { postPlan } = await load()
    fetchMock.mockResolvedValue(
      sse(['queued', { job_id: 'j', position: 2 }], ['progress', { stage: 'filtering', combinations: 73038, feasible: 1201 }], ['progress', { stage: 'waiting_quota', service: 'tdx', wait_seconds: 59 }], ['result', fixture]),
    )
    const events: string[] = []
    const result = await postPlan(req, { onEvent: (e) => events.push(e.type === 'queued' ? `queued ${e.data.position}` : e.data.stage) })
    expect(events).toEqual(['queued 2', 'filtering', 'waiting_quota'])
    expect(result.plans).toHaveLength(3)
    expect(result.stats.feasible).toBe(1201)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/plans')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(req)
  })
  it('error 事件 → PlanError，附 reasons', async () => {
    const { postPlan, PlanError } = await load()
    fetchMock.mockResolvedValue(sse(['error', { code: 'NO_FEASIBLE', message: '沒有接得上的組合', reasons: { showtime: 46718, budget: 1201 } }]))
    const e = await postPlan(req).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(PlanError)
    expect(e).toMatchObject({ code: 'NO_FEASIBLE', reasons: { showtime: 46718, budget: 1201 } })
  })
  it('串流開始前就回 503 JSON → PlanError，附 Retry-After', async () => {
    const { postPlan } = await load()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'QUEUE_FULL', message: '規劃佇列已滿' } }), { status: 503, headers: { 'Retry-After': '60' } }))
    await expect(postPlan(req)).rejects.toMatchObject({ code: 'QUEUE_FULL', status: 503, retryAfter: 60 })
  })
  it('沒等到 result 串流就結束 → STREAM_CLOSED', async () => {
    const { postPlan } = await load()
    fetchMock.mockResolvedValue(sse(['queued', { job_id: 'j', position: 1 }]))
    await expect(postPlan(req)).rejects.toMatchObject({ code: 'STREAM_CLOSED' })
  })
})

describe('下拉選單', () => {
  it('車站：台鐵、高鐵都叫「桃園」，機捷的站名有「站」字', async () => {
    const { getStations } = await load()
    fetchMock.mockResolvedValue(Response.json([{ id: 275, name: '桃園', operator: 'THSR' }, { id: 47, name: '桃園', operator: 'TRA' }, { id: 462, name: '高鐵桃園站', operator: 'TYMC' }]))
    expect(await getStations('Taoyuan')).toHaveLength(3)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/stations?county=Taoyuan')
  })
})
