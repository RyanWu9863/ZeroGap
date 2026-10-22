import type { PlanRequest } from '@/api/schemas'

/*
 * 出發點：車站，或「目前位置」（2026-10-21 使用者決定；後端規格書 6.4）。
 * - 座標取到小數點 3 位（約 100 公尺），後端也是這樣取整
 * - 座標只存在這台瀏覽器：網址只寫 from=here，複製出去的文字也不帶座標（使用者決定）
 * - 每次從精靈按「排出接得上的行程」都重新定位一次（使用者決定）
 */
export const LOCATION_NAME = '目前位置'

export const usesLocation = (r: Pick<PlanRequest, 'origin_lat' | 'origin_lng'>) => r.origin_lat != null && r.origin_lng != null

const round3 = (v: number) => Math.round(v * 1000) / 1000

/** 改成用某個車站出發 */
export const atStation = (id: number): Partial<PlanRequest> => ({ origin_station_id: id, origin_lat: null, origin_lng: null })

/** 改成用目前位置出發 */
export const atLocation = (lat: number, lng: number): Partial<PlanRequest> => ({ origin_station_id: null, origin_lat: round3(lat), origin_lng: round3(lng) })

/** 都還沒選（精靈第 1 步要選） */
export const noOrigin: Partial<PlanRequest> = { origin_station_id: 0, origin_lat: null, origin_lng: null }

/** 定位失敗的白話原因；畫面上一律接「請改選出發站」 */
export class LocateError extends Error {
  readonly reason: 'denied' | 'unavailable' | 'insecure'
  constructor(reason: LocateError['reason']) {
    super(
      reason === 'denied'
        ? '沒有取得定位的權限'
        : reason === 'insecure'
          ? '這個網址不能定位（要用 https 開啟）'
          : '定位失敗',
    )
    this.name = 'LocateError'
    this.reason = reason
  }
}

/** 向瀏覽器要目前位置（localhost 可以用，正式網址要 HTTPS） */
export function locate(timeoutMs = 10_000): Promise<{ lat: number; lng: number }> {
  if (typeof window === 'undefined' || !window.isSecureContext || !navigator.geolocation) return Promise.reject(new LocateError('insecure'))
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new LocateError(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}
