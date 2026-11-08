import { RotateCw } from 'lucide-react'
import { errorText } from '@/api/errors'
import { cn } from '@/lib/utils'

/**
 * 資料載入失敗（計畫 P1-1、P1-2）：依錯誤種類講白話＋重試。絕不偷用假資料頂替（Q68）。
 * compact＝放在頁面裡的一個區塊（精靈的一步、系統幕後的一段）；不加＝整頁置中。
 */
export function LoadError({ error, onRetry, compact }: { error: unknown; onRetry: () => void; compact?: boolean }) {
  const { title, detail } = errorText(error)
  return (
    <div className={cn('mx-auto max-w-md text-center', compact ? 'py-12' : 'py-32')} role="alert">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm hover:bg-muted"
      >
        <RotateCw className="size-4" /> 重試
      </button>
    </div>
  )
}
