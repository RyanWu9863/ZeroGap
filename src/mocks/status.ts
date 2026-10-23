import type { StatusResponse } from '@/api/schemas'
import { FRESHNESS } from './freshness'

/** 開發用假資料：TDX 這次匯入失敗、沿用快照，用來展示 Q63 的橘色提醒。 */
export const statusMock: StatusResponse = {
  jev_mode: '模擬模式',
  llm_status: '未啟用',
  data_freshness: {
    atmovies: { last_success_at: FRESHNESS.atmovies, last_status: 'ok' },
    osm: { last_success_at: FRESHNESS.osm, last_status: 'ok' },
    tdx: { last_success_at: FRESHNESS.tdx, last_status: 'failed' },
  },
}
