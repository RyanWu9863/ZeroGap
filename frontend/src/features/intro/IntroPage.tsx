import { useEffect } from 'react'
import { usePageTitle } from '@/shared/lib/usePageTitle'
import { Hero } from './Hero'
import { PainCompare } from './PainCompare'
import { ThreeSteps } from './ThreeSteps'
import { TimelinePreview } from './TimelinePreview'

/** 介紹頁（Q14、Q44）：標語＋情境卡 → 範例時間軸 → 痛點對比 → 三步驟＋再一次開始 */
export function IntroPage() {
  usePageTitle(null)
  // 首頁畫好之後，趁瀏覽器有空先把精靈的程式抓下來，按「開始規劃」時就不用等（P2-4）
  useEffect(() => {
    const prefetch = () => void import('@/features/wizard/WizardPage')
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(prefetch, { timeout: 3000 })
      return () => cancelIdleCallback(id)
    }
    const t = setTimeout(prefetch, 1500) // Safari 沒有 requestIdleCallback
    return () => clearTimeout(t)
  }, [])
  return (
    <>
      <Hero />
      <TimelinePreview />
      <PainCompare />
      <ThreeSteps />
    </>
  )
}
