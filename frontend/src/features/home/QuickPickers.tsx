import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DateCalendar } from '@/features/wizard/parts/DateCalendar'
import { StationPicker } from '@/features/wizard/parts/StationPicker'
import { triggerClass } from './pickerTrigger'

/*
 * 首頁「從哪出發」「哪天」的小視窗。延遲載入（QuickPlanForm 用 lazy）：
 * 小視窗元件不放進首頁主程式，慢速 4G 的首頁 LCP 才不會被拖慢（P2-4）。
 */
function Picker({ label, disabled, children }: { label: ReactNode; disabled?: boolean; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClass} disabled={disabled}>
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] gap-3 p-3">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

export function StationPopover({ label, stations, value, onChange }: {
  label: ReactNode
  stations: { id: number; name: string; operator?: string | null }[] | undefined
  value: number
  onChange: (id: number) => void
}) {
  return (
    <Picker label={label} disabled={!stations}>
      {(close) => (
        <>
          {stations && (
            <StationPicker
              stations={stations}
              value={value}
              onChange={(id) => {
                onChange(id)
                close()
              }}
            />
          )}
          <p className="text-xs text-muted-foreground">改用目前位置請到更多條件</p>
        </>
      )}
    </Picker>
  )
}

export function DatePopover({ label, hint, available, value, today, onChange }: {
  label: ReactNode
  hint?: string
  available: string[]
  value: string
  today: string
  onChange: (date: string) => void
}) {
  return (
    <Picker label={label}>
      {(close) => (
        <>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          <DateCalendar
            available={available}
            value={value}
            today={today}
            onChange={(date) => {
              onChange(date)
              close()
            }}
          />
        </>
      )}
    </Picker>
  )
}
