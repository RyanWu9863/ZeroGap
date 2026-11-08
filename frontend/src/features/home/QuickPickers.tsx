import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DateCalendar } from '@/features/wizard/parts/DateCalendar'
import { StationPicker } from '@/features/wizard/parts/StationPicker'
import { triggerClass } from './pickerTrigger'

/*
 * 首頁「從哪出發」「哪天」的小視窗。延遲載入（QuickPlanForm 互動或有空時才 import）：
 * 小視窗元件不放進首頁主程式，慢速 4G 的首頁 LCP 才不會被拖慢（P2-4）。
 */
/** 程式載入前就被要求的事：按了暫代按鈕（載入好就打開）、焦點在暫代按鈕上（載入好把焦點移到真的按鈕） */
export type PickerHandoff = { open?: boolean; focus?: boolean; describedBy?: string; /** 真的按鈕掛上了，暫代按鈕記的事可以清掉 */ taken?: () => void }

function Picker({ label, disabled, handoff, children }: {
  label: ReactNode
  disabled?: boolean
  handoff: PickerHandoff
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(Boolean(handoff.open))
  const trigger = useRef<HTMLButtonElement>(null)
  // 暫代按鈕被換掉時焦點會掉到 body：只在這種情況把焦點接回來，不搶使用者已經移到別處的焦點
  // 只在第一次掛上時接手（用 state 記住當下的值，之後不再變）
  const [focusOnMount] = useState(Boolean(handoff.focus && !handoff.open))
  const [taken] = useState(() => handoff.taken)
  useEffect(() => {
    if (focusOnMount && (!document.activeElement || document.activeElement === document.body)) trigger.current?.focus()
    taken?.()
  }, [focusOnMount, taken])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger ref={trigger} className={triggerClass} disabled={disabled} aria-describedby={handoff.describedBy}>
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] gap-3 p-3">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

export function StationPopover({ label, stations, value, onChange, handoff }: {
  label: ReactNode
  handoff: PickerHandoff
  stations: { id: number; name: string; operator?: string | null }[] | undefined
  value: number
  onChange: (id: number) => void
}) {
  return (
    <Picker label={label} disabled={!stations} handoff={handoff}>
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

export function DatePopover({ label, hint, available, value, today, onChange, handoff }: {
  label: ReactNode
  handoff: PickerHandoff
  hint?: string
  available: string[]
  value: string
  today: string
  onChange: (date: string) => void
}) {
  return (
    <Picker label={label} handoff={handoff}>
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
