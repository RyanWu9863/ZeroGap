import { TriangleAlert } from 'lucide-react'
import { useStatus } from '@/api/queries'

const NAMES: Record<string, string> = { atmovies: '場次', osm: '餐廳', tdx: '班次' }

/** 「M/D HH:MM」換成可以比大小的數字；不能直接比字串，不然 11/9 會排在 11/10 後面 */
const sortKey = (s: string) => {
  const [md, hm = '00:00'] = s.split(' ')
  const [m, d] = md.split('/').map(Number)
  const [h, min] = hm.split(':').map(Number)
  return ((m * 32 + d) * 24 + h) * 60 + min
}

/**
 * 結果頁底部一行小字（Q63，驗收 A9 的使用者版）。
 * 某個來源匯入失敗、用舊快照時，變成橘色提醒；完整狀態在系統幕後。
 */
export function FreshnessNote() {
  const { data } = useStatus()
  if (!data) return null
  const entries = Object.entries(data.data_freshness)
  const failed = entries.filter(([, v]) => v.last_status === 'failed')
  const latest = entries.flatMap(([, v]) => (v.last_success_at ? [v.last_success_at] : [])).sort((a, b) => sortKey(a) - sortKey(b)).at(-1)
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
