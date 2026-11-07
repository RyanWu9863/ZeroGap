import type { Run } from '@/api/planRuns'
import { STAGES, stageIndex } from './stages'

export const queueText = (position: number) => (position <= 1 ? '下一個就輪到你' : `前面還有 ${position - 1} 個人`)

export const quotaText = (seconds: number | null) =>
  seconds != null && seconds > 0 ? `交通資料查詢中，約 ${Math.ceil(seconds)} 秒` : '交通資料查詢中，請稍等'

/** 漏斗上方的一行字；aria-live 只念這一行（規格 4.3） */
export function funnelHeadline(run: Run | undefined): string {
  if (!run || run.status === 'connecting') return '正在送出條件…'
  if (run.status === 'queued') return `排隊中，${queueText(run.position ?? 1)}`
  if (run.status === 'done') return '每一段都檢查完了'
  if (run.status === 'failed') return '這組條件排不出來'
  if (run.waitingQuota) return quotaText(run.waitSeconds)
  return `${STAGES[stageIndex(run.stage)]?.label ?? '處理中'}…`
}
