import type { BufferGate, ReturnWindow } from '@/api/schemas'
import { BUFFER_LEVELS } from './config'
import { clock } from './time'

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

/**
 * 把「關卡＋分鐘」變成白話，例如「開演前還有 10 分」。
 * 回程有 return_window 時（規格書 v0.9）同時講兩件事：預定那班車幾分鐘後開、錯過的話幾點前還有車；
 * 回程整段走路（walkHome）時不講車。
 */
export function bufferSentence(gate: BufferGate, minutes: number, stationName?: string, window?: ReturnWindow | null, walkHome = false): string {
  switch (gate) {
    case 'showtime':
      return `開演前還有 ${minutes} 分`
    case 'last_order':
      return `離最後點餐還有 ${minutes} 分`
    case 'return_trip':
      // 出發站就在商圈旁邊、回程整段走路時沒有車可搭（規格書 6.5，2026-10-21）
      if (walkHome) return `走路回${stationName ?? '車站'}，離最晚出發還有 ${minutes} 分`
      return window
        ? `${window.minutes_to_planned} 分鐘後發車，錯過的話 ${clock(window.latest_depart_at)} 前還有車`
        : `離最晚要搭的回程車還有 ${minutes} 分`
    case 'latest_return':
      return `比最晚回到${stationName ?? '車站'}早 ${minutes} 分`
  }
}
