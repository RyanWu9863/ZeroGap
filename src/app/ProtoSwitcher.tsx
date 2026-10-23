import { Palette } from 'lucide-react'
import { useState } from 'react'
import { usePresentStore } from '@/features/present/presentStore'
import { useTrialStore } from '@/features/trial/trialStore'
import { useExperimentStore } from '@/shared/theme/experiment'
import { PROTO_NAME, useProtoStore, type Proto } from '@/shared/theme/proto'

/**
 * 試做版切換鈕：只在投票期間存在，定案後整個檔案刪掉（決策 Q38）。
 * - 桌機：左下角一整排
 * - 手機：縮成一顆小圓鈕，點了才展開，不擋內容
 * - 試用模式、簡報模式：隱藏（版本由主持人或網址決定，不該讓試用者或觀眾看到）
 */
export function ProtoSwitcher() {
  const { proto, setProto } = useProtoStore()
  const trial = useTrialStore((s) => s.active)
  const present = usePresentStore((s) => s.on)
  const [open, setOpen] = useState(false)
  const exp = useExperimentStore()
  if (trial || present) return null
  return (
    <div
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-[calc(1rem+env(safe-area-inset-left,0px))] z-50 flex items-center gap-1 rounded-full border bg-popover/90 p-1 text-xs shadow-lg backdrop-blur lg:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]"
      role="group"
      aria-label="試做版與新版體驗"
    >
      <button
        className="grid size-9 place-items-center rounded-full text-muted-foreground lg:hidden"
        aria-label={open ? '收起試做版切換' : '切換試做版'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Palette className="size-4" />
      </button>
      <span className="hidden px-2 text-muted-foreground lg:inline">試做版</span>
      <div role="radiogroup" aria-label="試做版" className="flex items-center gap-1">
      {(Object.keys(PROTO_NAME) as Proto[]).map((p) => (
        <button
          key={p}
          role="radio"
          aria-checked={proto === p}
          onClick={() => { setProto(p); setOpen(false) }}
          className={`${open ? 'block' : 'hidden'} rounded-full px-3 py-1.5 transition-colors aria-checked:bg-primary aria-checked:text-primary-foreground pointer-coarse:py-2.5 lg:block`}
        >
          {PROTO_NAME[p]}
        </button>
      ))}
      </div>
      {/* 沉浸式新版（?exp=1）：跟三個試做版是兩回事，獨立一顆開關 */}
      <span className={`${open ? 'block' : 'hidden'} mx-1 h-5 w-px bg-border lg:block`} aria-hidden="true" />
      <button
        role="switch"
        aria-checked={exp.on}
        onClick={() => exp.setOn(!exp.on)}
        className={`${open ? 'block' : 'hidden'} rounded-full px-3 py-1.5 transition-colors aria-checked:bg-primary aria-checked:text-primary-foreground pointer-coarse:py-2.5 lg:block`}
      >
        新版體驗
      </button>
    </div>
  )
}
