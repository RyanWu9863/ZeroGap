import type { Stage } from '@/api/schemas'

/**
 * 等待畫面上的步驟，對應後端 progress 事件的 stage（規格書 6.4）。
 * 使用者畫面不講 Jev、LLM（Q16），所以 llm_fallback 併進「挑出最適合你的 3 個」；
 * waiting_quota 不是一個步驟，只在目前的步驟下面加一行說明。
 */
export const STAGES: { key: Exclude<Stage, 'waiting_quota' | 'llm_fallback'>; label: string }[] = [
  { key: 'loading_data', label: '讀取當天的場次和餐廳' },
  { key: 'checking_feasibility', label: '查最早到得了、最晚要離開的車' },
  { key: 'filtering', label: '篩出每一段都接得上的組合' },
  { key: 'choosing', label: '挑出最適合你的 3 個' },
  { key: 'verifying_hours', label: '確認餐廳營業時間' },
  { key: 'routing', label: '查每個方案的精確班次' },
  { key: 'building_result', label: '排出時間軸' },
]

/** 目前在第幾步；還沒開始（排隊中）是 0，也就是第一步在轉 */
export function stageIndex(stage: Stage | null): number {
  if (!stage) return 0
  const key = stage === 'llm_fallback' ? 'choosing' : stage
  const i = STAGES.findIndex((s) => s.key === key)
  return i < 0 ? 0 : i
}
