import { useStatus } from '@/api/queries'
import { stamp } from '@/shared/lib/time'

/** 幾個時間裡最新的一個；都沒有是 null */
const latest = (...xs: (string | null | undefined)[]) => xs.filter((x): x is string => Boolean(x)).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null

/**
 * 結果頁底部一行小字（Q63，驗收 A9 的使用者版）：場次、餐廳資料的更新時間（/api/status 的 data_updated_at）。
 * 新格式沒有「匯入失敗」的旗標，只顯示時間；班次是規劃當下向 TDX 查的，另外說一句。完整狀態在系統幕後。
 */
export function FreshnessNote() {
  const { data } = useStatus()
  if (!data) return null
  const d = data.data_updated_at
  const movies = d.atmovies ?? null
  const food = latest(d.osm, d.google_places)
  if (!movies && !food) return null
  return (
    <p className="text-xs text-muted-foreground">
      {movies && <>場次資料更新於 <span className="zg-num">{stamp(movies)}</span>。</>}
      {food && <>餐廳資料更新於 <span className="zg-num">{stamp(food)}</span>。</>}
      班次是規劃當下即時查詢的。
    </p>
  )
}
