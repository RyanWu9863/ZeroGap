/**
 * 假資料的「資料更新時間」跟著今天走（以前寫死 10/28，比今天還晚、Demo 當天又顯得過期）。
 * 場次和餐廳是昨晚匯入的；班次故意停在前天、標成匯入失敗，用來展示 Q63 的橘色提醒。
 * 格式照後端：「M/D HH:MM」。
 */
function daysAgo(days: number, hhmm: string): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`
}

export const FRESHNESS = {
  atmovies: daysAgo(1, '19:49'),
  osm: daysAgo(1, '20:06'),
  tdx: daysAgo(2, '19:30'),
}
