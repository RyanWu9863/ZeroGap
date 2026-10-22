import { LogoMark } from '@/shared/brand/Logo'

/** 延遲載入的頁面還在下載時顯示錶盤 */
export function PageLoading() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-muted-foreground" role="status" aria-label="載入中">
      <LogoMark size={40} spinning />
    </div>
  )
}
