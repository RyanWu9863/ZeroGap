import { useState } from 'react'
import { useCoverage } from '@/api/queries'
import { todayISO } from '@/shared/lib/dates'
import { usePlanStore } from '@/store/planStore'
import type { DateContext } from './validation'

/**
 * 檢查日期用的「今天＋可選日」（P0-1）。今天在進入畫面時讀一次，同一個畫面裡不會變。
 * 可選日是選定商圈有場次的日子（/api/coverage）；還沒選商圈就只檢查「不是過去」。
 */
export function useDateContext(): Required<Pick<DateContext, 'today'>> & DateContext {
  const [today] = useState(todayISO)
  const area = usePlanStore((s) => s.request.area)
  const { data } = useCoverage(area || undefined)
  return { today, available: data?.available_dates }
}
