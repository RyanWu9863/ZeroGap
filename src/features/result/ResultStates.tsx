import { RotateCw } from 'lucide-react'
import { LogoMark } from '@/shared/brand/Logo'

/** 載入中：錶盤轉動（Q84）。完整的五道關卡篩選動畫在第 3–6 天做（Q21、Q54）。 */
export function ResultLoading() {
  return (
    <div className="flex flex-col items-center gap-4 py-32 text-muted-foreground" role="status">
      <LogoMark size={56} spinning />
      <p>正在檢查每一段接不接得上…</p>
    </div>
  )
}

/** 系統錯誤（Q68）：白話說明＋重試，絕不偷用假資料頂替 */
export function ResultError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md py-32 text-center">
      <p className="text-lg font-semibold">現在連不上排程服務</p>
      <p className="mt-2 text-sm text-muted-foreground">你填的條件都還在，稍等一下再試一次。</p>
      <button onClick={onRetry} className="mt-6 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted">
        <RotateCw className="size-4" /> 重試
      </button>
    </div>
  )
}
