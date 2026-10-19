import { TriangleAlert } from 'lucide-react'
import { useStatus } from '@/api/queries'

const NAMES: Record<string, string> = { atmovies: '場次', osm: '餐廳', tdx: '班次' }

/**
 * 結果頁底部一行小字（Q63，驗收 A9 的使用者版）。
 * 某個來源匯入失敗、用舊快照時，變成橘色提醒；完整狀態在系統幕後。
 */
export function FreshnessNote() {
  const { data } = useStatus()
  if (!data) return null
  const entries = Object.entries(data.data_freshness)
  const failed = entries.filter(([, v]) => v.last_status === 'failed')
  const latest = entries.map(([, v]) => v.last_success_at).filter(Boolean).sort().at(-1)
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>場次、餐廳、班次資料更新於 {latest?.split(' ')[0]}。</p>
      {failed.map(([k, v]) => (
        <p key={k} className="flex items-center gap-1.5 font-medium text-zg-tight">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          {NAMES[k] ?? k}資料為 {v.last_success_at} 的快照，出發前請再確認一次。
        </p>
      ))}
    </div>
  )
}
