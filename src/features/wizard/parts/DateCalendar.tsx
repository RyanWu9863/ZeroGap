import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/shared/lib/format'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/**
 * 日期（Q47）：「今天／明天／本週六」快捷鈕＋月曆。
 * 只有「有場次資料」的日子可以選，其他灰掉，避免選了才發現無解。
 */
export function DateCalendar({ available, value, onChange }: { available: string[]; value: string; onChange: (iso: string) => void }) {
  const today = new Date()
  const ok = new Set(available)
  const saturday = addDays(today, (6 - today.getDay() + 7) % 7)
  const quick = [
    { label: '今天', d: iso(today) },
    { label: '明天', d: iso(addDays(today, 1)) },
    { label: '本週六', d: iso(saturday) },
  ]
  const start = value ? new Date(value) : today
  const [month, setMonth] = useState(new Date(start.getFullYear(), start.getMonth(), 1))
  const lead = month.getDay()
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            disabled={!ok.has(q.d)}
            aria-pressed={value === q.d}
            onClick={() => onChange(q.d)}
            className="rounded-full border bg-card px-3.5 py-1.5 text-sm hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground lin:rounded-md"
          >
            {q.label} <span className="zg-num text-xs opacity-70">{formatDate(q.d)}</span>
          </button>
        ))}
      </div>
      <div className="zg-surface max-w-sm p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="上個月" className="rounded-md p-1.5 hover:bg-muted" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft className="size-4" />
          </button>
          <span className="zg-num text-sm font-medium">{month.getFullYear()} 年 {month.getMonth() + 1} 月</span>
          <button type="button" aria-label="下個月" className="rounded-md p-1.5 hover:bg-muted" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {['日', '一', '二', '三', '四', '五', '六'].map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="選擇日期">
          {cells.map((d, i) =>
            d ? (
              <button
                key={i}
                type="button"
                disabled={!ok.has(iso(d))}
                aria-pressed={value === iso(d)}
                aria-label={formatDate(iso(d))}
                onClick={() => onChange(iso(d))}
                className={cn(
                  'zg-num h-9 rounded-md text-sm hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/40 disabled:hover:bg-transparent',
                  'aria-pressed:bg-primary aria-pressed:text-primary-foreground',
                  iso(d) === iso(today) && 'font-semibold underline underline-offset-4',
                )}
              >
                {d.getDate()}
              </button>
            ) : (
              <span key={i} />
            ),
          )}
        </div>
      </div>
    </div>
  )
}
