import { Search } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/** 出發站：可搜尋的清單（Q45）。站多的時候打一兩個字就找得到。 */
export function StationPicker({ stations, value, onChange }: {
  stations: { id: number; name: string }[]
  value: string
  onChange: (name: string) => void
}) {
  const [q, setQ] = useState('')
  const shown = stations.filter((s) => s.name.includes(q.trim()))
  return (
    <div className="zg-surface overflow-hidden">
      <label className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 text-muted-foreground" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋車站，例如：中壢"
          aria-label="搜尋出發站"
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
      </label>
      <div role="radiogroup" aria-label="出發站" className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto p-2 sm:grid-cols-3">
        {shown.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={s.name === value}
            onClick={() => onChange(s.name)}
            className={cn('rounded-md px-3 py-2 text-left text-sm hover:bg-muted pointer-coarse:min-h-11', s.name === value && 'bg-primary text-primary-foreground hover:bg-primary')}
          >
            {s.name}
          </button>
        ))}
        {shown.length === 0 && <p className="col-span-full px-3 py-2 text-sm text-muted-foreground">找不到「{q}」，目前只有桃園市的車站。</p>}
      </div>
    </div>
  )
}
