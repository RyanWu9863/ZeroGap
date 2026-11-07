import type { PlanRequest } from '@/api/schemas'
import { writeRequest } from './urlState'

/** 開發用的假資料情境（?mock=…）要跟著換頁，其他參數不帶 */
const keepMock = (search: string, p: URLSearchParams) => {
  const mock = new URLSearchParams(search).get('mock')
  if (mock) p.set('mock', mock)
  return p
}

/** 排好的行程：/p/{編號}，第 2、3 個方案加 ?plan= */
export function planPath(id: string, rank: number, search: string): string {
  const p = new URLSearchParams()
  if (rank !== 1) p.set('plan', String(rank))
  const q = keepMock(search, p).toString()
  return `/p/${id}${q ? `?${q}` : ''}`
}

/** 改條件重排、過期了用同樣條件重排：回到 /result 送出 */
export function rerunPath(request: PlanRequest, search: string): string {
  return `/result?${keepMock(search, writeRequest(new URLSearchParams(), request, 1)).toString()}`
}
