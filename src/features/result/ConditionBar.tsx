import { RotateCw } from 'lucide-react'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PICK_FOR_ME, type ItineraryRequest } from '@/api/schemas'
import { formatDate, formatMoney } from '@/shared/lib/format'
import { ConditionEditor, type ConditionKind } from './ConditionEditor'

const TITLES: Record<ConditionKind, string> = {
  place: '出發站與商圈', date: '日期', time: '時段', order: '吃飯順序', movie: '電影', food: '料理', budget: '每人預算', walk: '步行上限',
}

function chips(r: ItineraryRequest): { kind: ConditionKind; label: string }[] {
  return [
    { kind: 'place', label: `${r.origin_station} → ${r.district_hub}` },
    { kind: 'date', label: formatDate(r.date) },
    { kind: 'time', label: `${r.earliest_departure}–${r.latest_return}` },
    { kind: 'order', label: r.dining_order === '先吃再看' ? '先吃再看' : '看完再吃' },
    { kind: 'movie', label: r.movie_title === PICK_FOR_ME ? '幫我挑電影' : `《${r.movie_title}》` },
    { kind: 'food', label: r.cuisine_type === '不限' ? '料理不限' : r.cuisine_type },
    { kind: 'budget', label: `每人 ${formatMoney(r.budget_per_person)}` },
    { kind: 'walk', label: `步行 ≤ ${r.max_walk_minutes} 分` },
  ]
}

/** 一個條件標籤＋它的小視窗：改完按「重算」才生效，按旁邊或 Esc 取消 */
function ConditionChip({ kind, label, req, onApply }: { kind: ConditionKind; label: string; req: ItineraryRequest; onApply: (p: Partial<ItineraryRequest>) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Partial<ItineraryRequest>>({})
  const changed = Object.entries(draft).some(([k, v]) => req[k as keyof ItineraryRequest] !== v)
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); setDraft({}) }}>
      <PopoverTrigger className="zg-num rounded-full border bg-card px-3 py-1 text-xs transition-colors hover:border-foreground/50 data-[popup-open]:border-primary lin:rounded-md">
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] gap-4 p-4">
        <p className="font-medium">改{TITLES[kind]}</p>
        <ConditionEditor kind={kind} value={{ ...req, ...draft }} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
        <div className="flex justify-end gap-2">
          <button className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted" onClick={() => setOpen(false)}>
            取消
          </button>
          <button
            disabled={!changed}
            onClick={() => { onApply(draft); setOpen(false) }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            <RotateCw className="size-3.5" /> 重算
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * 結果頁頂端的條件摘要（Q13b、Q58）：點哪個就在旁邊彈出小視窗，改完按「重算」。
 * 這就是 Q13 說的「工作台」：不用回精靈重填。
 */
export function ConditionBar({ req, onApply }: { req: ItineraryRequest; onApply: (p: Partial<ItineraryRequest>) => void }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="目前條件，點一下可以修改">
      {chips(req).map((c) => (
        <ConditionChip key={c.kind} kind={c.kind} label={c.label} req={req} onApply={onApply} />
      ))}
    </div>
  )
}
