import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { requestKey } from '@/api/planRuns'
import type { PlanRequest } from '@/api/schemas'
import { usePlanStore } from '@/store/planStore'
import { needsOrigin, readRank, readRequest, writeRequest } from './urlState'

/**
 * 結果頁的條件來源（Q62）：網址優先，其次瀏覽器暫存。
 * - 從精靈進來（網址還沒有條件）→ 把條件寫上網址
 * - 打開別人傳來的網址 → 用網址的條件，並存回暫存
 * - 改條件、換方案 → 同時更新暫存和網址
 */
export function useResultState() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const { request: stored, selectedRank, replaceRequest, selectRank } = usePlanStore()
  // 目前位置的座標只存在這台瀏覽器（網址只寫 from=here）
  const here = stored.origin_lat != null && stored.origin_lng != null ? { lat: stored.origin_lat, lng: stored.origin_lng } : null
  const fromUrl = readRequest(params, here)
  /** 別人傳來「從目前位置出發」的網址：這台沒有座標，要請使用者選出發點 */
  const pickOrigin = needsOrigin(params, here)
  const request = fromUrl ?? stored
  const rank = (fromUrl ? readRank(params) : null) ?? selectedRank
  const urlKey = fromUrl ? requestKey(fromUrl) : null

  useEffect(() => {
    if (pickOrigin) return
    if (!urlKey) {
      setParams((p) => writeRequest(p, stored, selectedRank), { replace: true, state: location.state })
    } else if (urlKey !== requestKey(stored)) {
      replaceRequest(JSON.parse(urlKey) as PlanRequest)
    }
  }, [urlKey]) // eslint-disable-line react-hooks/exhaustive-deps -- 只在網址條件改變時同步一次

  const update = (patch: Partial<PlanRequest>) => {
    const next = { ...request, ...patch }
    replaceRequest(next)
    setParams((p) => writeRequest(p, next, 1), { replace: true })
  }
  const choosePlan = (r: number) => {
    selectRank(r)
    setParams((p) => writeRequest(p, request, r), { replace: true })
  }
  return { request, rank, update, choosePlan, pickOrigin }
}
