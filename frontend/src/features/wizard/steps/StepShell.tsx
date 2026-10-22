import type { ReactNode } from 'react'
import { LogoMark } from '@/shared/brand/Logo'

/** 每一步共用的標題＋內容間距；選項還在載入時顯示錶盤 */
export function StepShell({ title, loading, children }: { title: string; loading?: boolean; children: ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-bold sm:text-3xl cine:font-semibold lin:font-semibold">{title}</h1>
      {loading ? (
        <div className="grid place-items-center py-20 text-muted-foreground" role="status" aria-label="載入選項中">
          <LogoMark size={40} spinning />
        </div>
      ) : (
        <div className="mt-8 space-y-8">{children}</div>
      )}
    </section>
  )
}
