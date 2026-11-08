import { ArrowLeft, ArrowRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { usePageTitle } from '@/shared/lib/usePageTitle'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { atLocation, locate, LocateError, noOrigin, usesLocation } from '@/shared/lib/origin'
import { usePlanStore } from '@/store/planStore'
import { StepFood } from './steps/StepFood'
import { StepFun } from './steps/StepFun'
import { StepPlace } from './steps/StepPlace'
import { StepTime } from './steps/StepTime'
import { SummaryLine } from './parts/SummaryLine'
import { useDateContext } from './useDateContext'
import { firstIncomplete, STEPS, stepComplete } from './validation'
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
  const setRequest = usePlanStore((s) => s.setRequest)
  const [locating, setLocating] = useState(false)
  const dateCtx = useDateContext()
  // 往後一步從右邊滑入、往前一步從左邊滑入（React 官方「依前一次的值調整 state」寫法）
  const [prev, setPrev] = useState(n)
  const [dir, setDir] = useState(1)
  // 換過步驟之後，新的一步滑進來時把焦點移到標題，螢幕閱讀器才知道換頁了（P2-2）；第一次進來不搶焦點
  const [moved, setMoved] = useState(false)
  if (n !== prev) {
    setDir(n > prev ? 1 : -1)
    setPrev(n)
    setMoved(true)
  }
  const stepRef = useRef<HTMLDivElement>(null)
  const label = STEPS.find((s) => s.n === n)?.label
  usePageTitle(label ? `${'①②③④'[n - 1]} ${label}` : null)

  if (!(n in STEP_VIEWS)) return <Navigate to="/plan/1" replace />
  const View = STEP_VIEWS[n as keyof typeof STEP_VIEWS]
  const complete = stepComplete(n, request, dateCtx)

  const submit = async () => {
    const missing = firstIncomplete(request, dateCtx)
    if (missing) return navigate(`/plan/${missing}`)
    // 用目前位置出發時，每次送出都重新定位（使用者決定）；失敗就回第 1 步改選車站
    if (usesLocation(request)) {
      setLocating(true)
      try {
        const { lat, lng } = await locate()
        setRequest(atLocation(lat, lng))
      } catch (e) {
        setRequest(noOrigin)
        return navigate('/plan/1', { state: { locateError: e instanceof LocateError ? e.message : '定位失敗' } })
      } finally {
        setLocating(false)
      }
    }
    navigate('/result', { state: { replay: true } })
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
          ref={stepRef}
          onAnimationComplete={(def) => {
            if (moved && def === 'center') stepRef.current?.querySelector('h1')?.focus({ preventScroll: true })
          }}
        >
          <View />
        </motion.div>
      </AnimatePresence>

      <div
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-30 border-t bg-background/90 p-3 backdrop-blur sm:static sm:mt-10 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
      >
        {n < 4 ? (
          <div className="flex justify-end">
            <button
              onClick={() => navigate(`/plan/${n + 1}`)}
              disabled={!complete}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              下一步 <ArrowRight className="size-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <SummaryLine />
            <button
              onClick={submit}
              disabled={locating}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-70"
            >
              {locating ? '正在取得目前位置…' : '排出接得上的行程'} <ArrowRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
