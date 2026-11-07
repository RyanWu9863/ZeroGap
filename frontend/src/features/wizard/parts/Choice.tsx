import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** 一題的標題區（竹老師：一頁專心問一件事） */
export function Field({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-medium">{title}</legend>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  )
}

/** 大卡片單選（商圈、吃飯順序、幫我挑…） */
export function ChoiceCard({ selected, onClick, title, desc, icon, disabled, className }: {
  selected: boolean
  onClick: () => void
  title: ReactNode
  desc?: ReactNode
  icon?: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'zg-surface relative flex w-full items-start gap-3 p-4 text-left transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-45',
        selected ? 'border-foreground ring-2 ring-foreground/80' : 'hover:border-foreground/40',
        className,
      )}
    >
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {desc && <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>}
      </span>
      {selected && <Check className="size-4 shrink-0" aria-hidden="true" />}
    </button>
  )
}

export type ChipOption<T> = { value: T; label: ReactNode; disabled?: boolean }

/** 一排小按鈕單選（料理、預算、步行、片型…）。值可以是 null：「不限」就是 null（規格書 6.4） */
export function Chips<T extends string | number | null>({ options, value, onChange, label, describedBy, invalid }: {
  options: ChipOption<T>[]
  value: T
  onChange: (v: T) => void
  label: string
  /** 錯誤說明的 id：掛在每個選項上，焦點落在哪個選項都念得到 */
  describedBy?: string
  invalid?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-describedby={describedBy}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className="zg-num rounded-full border bg-card px-3.5 py-1.5 text-sm transition-colors pointer-coarse:min-h-10 hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-40 aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 預設收起的「更多偏好」（Q51） */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group zg-surface p-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm">
        <span>{title}</span>
        <span className="text-xs text-muted-foreground group-open:hidden">可略過・展開</span>
        <span className="hidden text-xs text-muted-foreground group-open:inline">收起</span>
      </summary>
      <div className="mt-4 space-y-5">{children}</div>
    </details>
  )
}
