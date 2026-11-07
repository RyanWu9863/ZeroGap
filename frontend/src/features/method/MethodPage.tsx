import { usePageTitle } from '@/shared/lib/usePageTitle'

export function MethodPage() {
  usePageTitle('方法')
  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">我們怎麼確定每一段都接得上</h1>
    </div>
  )
}
