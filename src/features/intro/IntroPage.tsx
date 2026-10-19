import { useEffect } from 'react'
import { useTrialStore } from '@/features/trial/trialStore'
import { useProtoStore } from '@/shared/theme/proto'
import { Hero } from './Hero'
import { PainCompare } from './PainCompare'
import { ThreeSteps } from './ThreeSteps'
import { TimelinePreview } from './TimelinePreview'

/** 介紹頁（Q14、Q44）：標語＋情境卡 → 範例時間軸 → 痛點對比 → 三步驟＋再一次開始 */
export function IntroPage() {
  // 試用模式：進到介紹頁就開始計時（Q79）
  const { active, current, begin } = useTrialStore()
  const proto = useProtoStore((s) => s.proto)
  useEffect(() => {
    if (active && !current) begin(proto)
  }, [active, current, begin, proto])
  return (
    <>
      <Hero />
      <TimelinePreview />
      <PainCompare />
      <ThreeSteps />
    </>
  )
}
