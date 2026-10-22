import type { RestaurantSource } from '@/api/schemas'
import { cn } from '@/lib/utils'
import grayLogo from './google/GoogleMaps_Logo_Gray.svg'
import whiteLogo from './google/GoogleMaps_Logo_White.svg'

/**
 * Google Maps 標誌（規格書 3.3、6.7；交接文件第 5 節查過官方規定）：
 * 沒有搭配 Google 地圖顯示 Places 資料時要附上。官方檔案不可修改：
 * 淺色背景用灰色版、深色（html.dark）用白色版；高 18px、不改比例；上左右留白至少 10px、下方 5px。
 */
export function GoogleMapsMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex px-2.5 pb-[5px] pt-2.5', className)}>
      <img src={grayLogo} alt="Google Maps" width={98} height={18} className="h-[18px] w-auto dark:hidden" />
      <img src={whiteLogo} alt="Google Maps" width={98} height={18} className="hidden h-[18px] w-auto dark:inline" />
    </span>
  )
}

/**
 * OpenStreetMap 出處（規格書 6.7，OSMF 署名指南）：寫 OpenStreetMap、連到版權頁、看得出是 ODbL 授權。
 * 一組結果標一次就可以，不用點開就要看得到。
 */
export function OsmCredit({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      餐廳資料 ©{' '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
        OpenStreetMap
      </a>{' '}
      貢獻者，採用 Open Database License 授權
    </p>
  )
}

/** 依餐廳來源放對應的出處；示意資料（demo）不用標（規格書 6.7） */
export function SourceCredit({ source, className }: { source: RestaurantSource; className?: string }) {
  if (source === 'google') return <GoogleMapsMark className={className} />
  if (source === 'osm') return <OsmCredit className={className} />
  return null
}
