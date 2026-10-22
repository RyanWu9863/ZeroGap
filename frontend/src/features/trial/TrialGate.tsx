import { useState } from 'react'
import { Chips } from '@/features/wizard/parts/Choice'
import { PROTO_NAME, useProtoStore, type Proto } from '@/shared/theme/proto'
import { useTrialStore } from './trialStore'

const ROTATION: Proto[] = ['timetable', 'cinematic', 'linear']

/**
 * 試用模式的「主持人開始畫面」：蓋住介紹頁，等試用者坐好、主持人按下才開始計時，
 * 這樣「看懂用途」的秒數不會把換人的時間算進去。
 * 版本預設輪流 A → B → C，讓每個版本的試用人數差不多，試用數據可以拿來當三版投票的依據。
 */
export function TrialGate() {
  const { active, current, sessions, begin } = useTrialStore()
  const setProto = useProtoStore((s) => s.setProto)
  const [proto, setChoice] = useState<Proto>(ROTATION[sessions.length % ROTATION.length])
  if (!active || current) return null
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-background/95 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-label="試用開始">
      <div className="zg-surface w-full max-w-md bg-popover p-6">
        <p className="text-xs text-muted-foreground">試用模式（主持人操作）</p>
        <h1 className="mt-1 text-xl font-semibold">第 {sessions.length + 1} 位試用者</h1>
        <div className="mt-5 space-y-2">
          <p className="text-sm">這位用哪個版本？（預設輪流）</p>
          <Chips label="試做版" value={proto} onChange={setChoice} options={ROTATION.map((p) => ({ value: p, label: PROTO_NAME[p] }))} />
        </div>
        <div className="mt-5 rounded-md bg-muted p-3 text-sm">
          請對試用者說：「請用這個網站，排一個今晚看電影加吃飯的行程。」說完就不要再提示。
        </div>
        <button
          onClick={() => { setProto(proto); begin(proto) }}
          className="mt-5 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground"
        >
          試用者坐好了，開始計時
        </button>
      </div>
    </div>
  )
}
