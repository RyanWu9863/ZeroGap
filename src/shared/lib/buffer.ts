import type { BufferGate } from '@/api/schemas'
import { BUFFER_LEVELS } from './config'

export type BufferLevel = 'roomy' | 'snug' | 'tight'

/** 緩衝分級（決策 Q40）：≥30 寬鬆、10–29 剛好、<10 偏緊。 */
export function bufferLevel(minutes: number): BufferLevel {
  if (minutes >= BUFFER_LEVELS.roomy) return 'roomy'
  if (minutes >= BUFFER_LEVELS.snug) return 'snug'
  return 'tight'
}

export const LEVEL_LABEL: Record<BufferLevel, string> = {
  roomy: '寬鬆',
  snug: '剛好',
  tight: '偏緊',
}

/** 把「關卡＋分鐘」變成白話，例如「開演前還有 10 分」。 */
export function bufferSentence(gate: BufferGate, minutes: number, stationName?: string): string {
  switch (gate) {
    case 'showtime':
      return `開演前還有 ${minutes} 分`
    case 'last_order':
      return `離最後點餐還有 ${minutes} 分`
    case 'return_trip':
      return `回程車開前還有 ${minutes} 分`
    case 'latest_return':
      return `比最晚回到${stationName ?? '車站'}早 ${minutes} 分`
  }
}
