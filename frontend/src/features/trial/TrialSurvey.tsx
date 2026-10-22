import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Chips } from '@/features/wizard/parts/Choice'
import { usePlanStore } from '@/store/planStore'
import { useTrialStore, type TrialAnswers } from './trialStore'

/**
 * 試用模式的 3 題小問卷（Q80）。看到結果後浮在右下角，不擋住畫面，試用者看完再填。
 * 填完可以按「下一位試用者」，條件清空、回到介紹頁重新計時。
 */
export function TrialSurvey() {
  const { active, current, answer } = useTrialStore()
  const resetRequest = usePlanStore((s) => s.resetRequest)
  const navigate = useNavigate()
  const [a, setA] = useState<Partial<TrialAnswers>>({})
  const [done, setDone] = useState(false)
  if (!active || (!current?.resultAt && !done)) return null

  const box = 'fixed right-4 z-50 w-[min(22rem,calc(100vw-2rem))] zg-surface bg-popover p-4 shadow-xl'
  const pos = { bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }

  if (done) {
    return (
      <div className={box} style={pos} role="status">
        <p className="font-medium">謝謝你的試用！</p>
        <button
          className="mt-3 w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground"
          onClick={() => { resetRequest(); setDone(false); setA({}); navigate('/') }}
        >
          下一位試用者 →
        </button>
      </div>
    )
  }
  const complete = a.yellow && a.willing && a.faster !== undefined
  return (
    <form className={box} style={pos} aria-label="試用小問卷" onSubmit={(e) => { e.preventDefault(); if (complete) { answer(a as TrialAnswers); setDone(true) } }}>
      <p className="font-medium">試用小問卷（3 題）</p>
      <div className="mt-3 space-y-4 text-sm">
        <div>
          <p className="mb-2">1. 黃底的金額代表什麼？</p>
          <Chips label="黃底代表" value={a.yellow ?? ('' as TrialAnswers['yellow'])} onChange={(yellow) => setA({ ...a, yellow })}
            options={[{ value: 'estimate', label: '估計值' }, { value: 'discount', label: '特價' }, { value: 'recommend', label: '推薦' }]} />
        </div>
        <div>
          <p className="mb-2">2. 你願意照這個行程出門嗎？（1 不願意～5 很願意）</p>
          <Chips label="願意程度" value={a.willing ?? 0} onChange={(willing) => setA({ ...a, willing })} options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))} />
        </div>
        <div>
          <p className="mb-2">3. 比你自己查三個 App 快嗎？</p>
          <Chips label="比自己查快" value={a.faster === undefined ? '' : a.faster ? 'y' : 'n'} onChange={(v) => setA({ ...a, faster: v === 'y' })}
            options={[{ value: 'y', label: '是' }, { value: 'n', label: '否' }]} />
        </div>
      </div>
      <button type="submit" disabled={!complete} className="mt-4 w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">
        送出
      </button>
    </form>
  )
}
