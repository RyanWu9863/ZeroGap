import type { ReactNode } from 'react'
import { LogoMark } from '@/shared/brand/Logo'
import { LoadError } from '@/shared/ui/LoadError'

/** 每一步共用的標題＋內容間距；選項還在載入時顯示錶盤，載入失敗時顯示重試（計畫 P1-1） */
export function StepShell({ title, loading, error, onRetry, children }: {
  title: string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  children: ReactNode
}) {
  return (
    <section>
      <h1 tabIndex={-1} className="text-2xl font-bold outline-none sm:text-3xl cine:font-semibold lin:font-semibold">
        {title}
      </h1>
      {error && onRetry ? (
        <LoadError error={error} onRetry={onRetry} compact />
      ) : loading ? (
        <div className="grid place-items-center py-20 text-muted-foreground" role="status" aria-label="載入選項中">
          <LogoMark size={40} spinning />
        </div>
      ) : (
        <div className="mt-8 space-y-8">{children}</div>
      )}
    </section>
  )
}
