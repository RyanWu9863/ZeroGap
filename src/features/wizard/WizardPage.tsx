import { ArrowLeft, ArrowRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useTrialStore } from '@/features/trial/trialStore'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { usePlanStore } from '@/store/planStore'
import { StepFood } from './steps/StepFood'
import { StepFun } from './steps/StepFun'
import { StepPlace } from './steps/StepPlace'
import { StepTime } from './steps/StepTime'
import { SummaryLine } from './parts/SummaryLine'
import { firstIncomplete, stepComplete } from './validation'
import { WizardProgress } from './WizardProgress'

const STEP_VIEWS = { 1: StepPlace, 2: StepTime, 3: StepFun, 4: StepFood } as const

/**
 * 四步精靈（Q13、Q25、Q26）：一頁一題、滑入滑出。
 * 中間步驟：右下角小「下一步」；最後一步：滿版「排出接得上的行程」，上方一行條件摘要（Q53）。
 */
export function WizardPage() {
  const n = Number(useParams().step)
  const navigate = useNavigate()
  const request = usePlanStore((s) => s.request)
  const markTrial = useTrialStore((s) => s.mark)
  useEffect(() => markTrial('startClickAt'), [markTrial]) // 試用計時：按了開始（Q79）
  // 往後一步從右邊滑入、往前一步從左邊滑入（React 官方「依前一次的值調整 state」寫法）
  const [prev, setPrev] = useState(n)
  const [dir, setDir] = useState(1)
  if (n !== prev) {
    setDir(n > prev ? 1 : -1)
    setPrev(n)
  }

  if (!(n in STEP_VIEWS)) return <Navigate to="/plan/1" replace />
  const View = STEP_VIEWS[n as keyof typeof STEP_VIEWS]
  const complete = stepComplete(n, request)

  const submit = () => {
    const missing = firstIncomplete(request)
    if (missing) navigate(`/plan/${missing}`)
    else navigate('/result', { state: { replay: true } })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-40 pt-6 sm:px-6 sm:pb-16">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to={n > 1 ? `/plan/${n - 1}` : '/'}
          className="grid size-9 shrink-0 place-items-center rounded-full border hover:bg-muted"
          aria-label={n > 1 ? '上一步' : '回介紹頁'}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <WizardProgress current={n} />
        </div>
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={n}
          custom={dir}
          variants={{
            enter: (d: number) => ({ opacity: 0, x: 40 * d }),
            center: { opacity: 1, x: 0 },
            exit: (d: number) => ({ opacity: 0, x: -40 * d }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <View />
        </motion.div>
      </AnimatePresence>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 p-3 backdrop-blur sm:static sm:mt-10 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {n < 4 ? (
          <div className="flex justify-end">
            <button
              onClick={() => navigate(`/plan/${n + 1}`)}
              disabled={!complete}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40 lin:rounded-md"
            >
              下一步 <ArrowRight className="size-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <SummaryLine />
            <button
              onClick={submit}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground lin:rounded-md"
            >
              排出接得上的行程 <ArrowRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
