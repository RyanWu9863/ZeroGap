import { TrialGate } from '@/features/trial/TrialGate'
import { Hero } from './Hero'
import { PainCompare } from './PainCompare'
import { ThreeSteps } from './ThreeSteps'
import { TimelinePreview } from './TimelinePreview'

/** 介紹頁（Q14、Q44）：標語＋情境卡 → 範例時間軸 → 痛點對比 → 三步驟＋再一次開始 */
export function IntroPage() {
  return (
    <>
      {/* 試用模式：主持人按下才開始計時（Q79） */}
      <TrialGate />
      <Hero />
      <TimelinePreview />
      <PainCompare />
      <ThreeSteps />
    </>
  )
}
