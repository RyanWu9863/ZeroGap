import { LoaderCircle, LocateFixed, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { PlanRequest } from '@/api/schemas'
import { cn } from '@/lib/utils'
import { atLocation, locate, LocateError, usesLocation } from '@/shared/lib/origin'

/**
 * 「使用目前位置」（2026-10-21 使用者決定）：放在車站清單上方。
 * 定位成功就改成從目前位置出發；拒絕或失敗就說明原因，留在選車站。
 * 選了車站會自動取消目前位置（由車站清單那邊處理）。
 */
export function LocationButton({ request, onChange, error: initialError }: {
  request: PlanRequest
  onChange: (patch: Partial<PlanRequest>) => void
  /** 從別的地方帶進來的定位失敗訊息（例如送出前重新定位失敗） */
  error?: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const on = usesLocation(request)

  const pick = async () => {
    setBusy(true)
    setError(null)
    try {
      const { lat, lng } = await locate()
      onChange(atLocation(lat, lng))
    } catch (e) {
      setError(e instanceof LocateError ? e.message : '定位失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-pressed={on}
        onClick={pick}
        disabled={busy}
        className={cn(
          'zg-surface flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:border-foreground/40 disabled:opacity-70 pointer-coarse:min-h-12',
          on && 'border-foreground ring-2 ring-foreground/80 cine:border-primary cine:ring-primary',
        )}
      >
        {busy ? <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <LocateFixed className="size-4 shrink-0" aria-hidden="true" />}
        <span className="flex-1">
          <span className="block font-medium">{busy ? '正在取得目前位置…' : on ? '已使用目前位置' : '使用目前位置'}</span>
          <span className="block text-xs text-muted-foreground">
            {on ? '約 100 公尺內的位置，只存在這台裝置；按下面的車站可以改回選車站。' : '從你現在的位置出發，最後回到這裡。'}
          </span>
        </span>
      </button>
      {error && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-zg-tight" role="alert">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {error}，請改選出發站。
        </p>
      )}
    </div>
  )
}
