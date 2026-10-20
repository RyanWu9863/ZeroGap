import { useState } from 'react'
import { useOptions } from '@/api/queries'
import { todayISO } from '@/shared/lib/dates'
import type { DateContext } from './validation'

/** 檢查日期用的「今天＋可選日」（P0-1）。今天在進入畫面時讀一次，同一個畫面裡不會變。 */
export function useDateContext(): Required<Pick<DateContext, 'today'>> & DateContext {
  const [today] = useState(todayISO)
  const { data } = useOptions()
  return { today, available: data?.available_dates }
}
