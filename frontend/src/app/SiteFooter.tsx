import { useQuery } from '@tanstack/react-query'
import { getStatus } from '@/api/client'

/** 頁尾（規格 3.1）：資料多新、從哪來、原始碼。拿不到更新時間就不顯示那一行，不擋畫面 */
export function SiteFooter() {
  const { data } = useQuery({ queryKey: ['status'], queryFn: ({ signal }) => getStatus(signal), staleTime: 5 * 60_000 })
  const times = Object.values(data?.data_updated_at ?? {}).filter((t): t is string => !!t)
  const latest = times.length ? new Date(Math.max(...times.map((t) => Date.parse(t)))) : null
  return (
    <footer className="mx-auto grid max-w-6xl gap-2 px-4 pb-28 pt-16 text-xs text-muted-foreground sm:px-6 sm:pb-12">
      {latest && (
        <p>
          資料更新：
          <time dateTime={latest.toISOString()} className="zg-num">
            {latest.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
          </time>
        </p>
      )}
      <p>交通：交通部 TDX 運輸資料流通服務・電影場次：開眼電影網・餐廳：OpenStreetMap、Google 地圖</p>
      <p>
        ZeroGap 零空檔・資策會 AIAE1 第一組專題・
        <a href="https://github.com/RyanWu9863/ZeroGap" className="underline underline-offset-2 hover:text-foreground" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
    </footer>
  )
}
