import { RotateCw } from 'lucide-react'
import { Link } from 'react-router'
import type { RunError } from '@/api/planRuns'

/** 錯誤代碼 → 白話（規格書 6.1、6.4）。細節放系統幕後，這裡只講使用者能做什麼 */
function explain(e: RunError | null): { title: string; body: string; fix?: boolean } {
  const wait = e?.retryAfter ? Math.max(1, Math.ceil(e.retryAfter / 60)) : null
  switch (e?.code) {
    case 'QUEUE_FULL':
      return { title: '現在排隊的人太多了', body: `已經有好幾個規劃在排隊，大約 ${wait ?? 1} 分鐘後再試一次。` }
    case 'RATE_LIMITED':
      return { title: '規劃的次數有點多', body: `每小時最多規劃 10 次，${wait ? `${wait} 分鐘` : '稍等一下'}後再試。` }
    case 'PLAN_IN_PROGRESS':
      return { title: '你已經有一個規劃在進行', body: '可能是在別的分頁。等它完成或關掉那個分頁，再試一次。' }
    case 'TIMEOUT':
      return { title: '這次排太久，先停下來了', body: '排隊或規劃超過時間上限，再試一次通常就會好。' }
    case 'VALIDATION_ERROR':
    case 'NOT_FOUND':
      return { title: '條件有一點問題', body: e.message || '有些選項已經不能用了，回去重新選一次。', fix: true }
    default:
      return { title: '現在連不上排程服務', body: '你填的條件都還在，稍等一下再試一次。' }
  }
}

/** 系統錯誤（Q68）：白話說明＋重試，絕不偷用假資料頂替 */
export function ResultError({ error, onRetry }: { error: RunError | null; onRetry: () => void }) {
  const x = explain(error)
  return (
    <div className="mx-auto max-w-md px-4 py-32 text-center">
      <p className="text-lg font-semibold">{x.title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{x.body}</p>
      <div className="mt-6 flex justify-center gap-2">
        {x.fix ? (
          <Link to="/plan/1" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted">回去改條件</Link>
        ) : (
          <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted">
            <RotateCw className="size-4" /> 重試
          </button>
        )}
      </div>
    </div>
  )
}
