import { useEffect } from 'react'
import { HomeHero } from '@/features/home/HomeHero'
import { QuickPlan } from '@/features/home/QuickPlanForm'
import { usePageTitle } from '@/shared/lib/usePageTitle'
import { PainCompare } from './PainCompare'
import { ThreeSteps } from './ThreeSteps'
import { TimelinePreview } from './TimelinePreview'

/** 首頁（規格 3.2、4.2）：標題＋大數字＋點陣 → 四格快速條件 → 範例時間軸 → 痛點對比 → 三步驟 */
export function IntroPage() {
  usePageTitle(null)
  // 首頁畫好之後，趁瀏覽器有空先把精靈和結果頁的程式抓下來，按「排行程」「更多條件」時就不用等（P2-4）
  useEffect(() => {
    const prefetch = () => {
      void import('@/features/wizard/WizardPage')
      void import('@/features/result/ResultPage')
      void import('@/features/home/QuickPickers') // 首頁四格的小視窗
    }
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(prefetch, { timeout: 3000 })
      return () => cancelIdleCallback(id)
    }
    const t = setTimeout(prefetch, 1500) // Safari 沒有 requestIdleCallback
    return () => clearTimeout(t)
  }, [])
  return (
    <>
      <HomeHero />
      <QuickPlan />
      <TimelinePreview />
      <PainCompare />
      <ThreeSteps />
    </>
  )
}
