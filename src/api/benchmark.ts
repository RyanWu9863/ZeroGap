import { departureInPast } from '@/features/wizard/validation'
import { BENCHMARK_STATION_NAME, benchmarkRequest } from '@/mocks/request'
import { stationLabel } from '@/shared/lib/format'
import { USE_MOCK, getAreas, getCounties, getCoverage, getStations } from './client'
import type { PlanRequest } from './schemas'
import { useDemoStore } from '@/store/demoStore'

/**
 * 基準案例換成真後端也排得出來的條件（簡報模式的 1／2／3 鍵用）。
 * 假資料的車站 id、日期在真後端不存在，所以：
 * - 車站依站名（台鐵「中壢」）找真的 id
 * - 商圈不開放就改用第一個開放的
 * - 日期不在 available_dates（或是今天但出門時間已經過了）就用第一個排得出來的日子
 * 假資料模式（含展示模式）直接用 benchmarkRequest。
 */
export async function resolveBenchmark(patch: Partial<PlanRequest> = {}): Promise<PlanRequest> {
  const base = { ...benchmarkRequest, ...patch }
  if (USE_MOCK || useDemoStore.getState().demo) return base
  const counties = await getCounties()
  const county = counties.find((c) => c.has_open_areas !== false)?.code ?? 'Taoyuan'
  const [areas, stations] = await Promise.all([getAreas(county), getStations(county)])
  const open = areas.filter((a) => a.is_open !== false)
  const area = open.find((a) => a.code === base.area)?.code ?? open[0]?.code ?? base.area
  const named = stations.filter((s) => stationLabel(s.name) === stationLabel(BENCHMARK_STATION_NAME))
  const station = named.find((s) => s.operator === 'TRA') ?? named[0] ?? stations[0]
  const { available_dates } = await getCoverage(area)
  const ok = available_dates.filter((d) => !departureInPast({ ...base, date: d }))
  const date = ok.includes(base.date) ? base.date : (ok[0] ?? base.date)
  return { ...base, area, origin_station_id: station?.id ?? base.origin_station_id, date }
}
