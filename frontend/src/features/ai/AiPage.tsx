import { usePageTitle } from '@/shared/lib/usePageTitle'

export function AiPage() {
  usePageTitle('AI 助理')
  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">在 AI 助理裡使用 ZeroGap</h1>
    </div>
  )
}
