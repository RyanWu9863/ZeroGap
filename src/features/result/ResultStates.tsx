import { LogoMark } from '@/shared/brand/Logo'
import { LoadError } from '@/shared/ui/LoadError'

/** 載入中：錶盤轉動（Q84）。動畫播完、資料還沒回來時才會看到；五道關卡動畫在 FilterRun（Q21、Q54）。 */
export function ResultLoading() {
  return (
    <div className="flex flex-col items-center gap-4 py-32 text-muted-foreground" role="status">
      <LogoMark size={56} spinning />
      <p>正在檢查每一段接不接得上…</p>
    </div>
  )
}

/** 系統錯誤（Q68）：依錯誤種類講白話＋重試，絕不偷用假資料頂替 */
export function ResultError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <LoadError error={error} onRetry={onRetry} />
}
