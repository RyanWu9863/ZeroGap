import type { Plan, PlanRequest } from '@/api/schemas'
import { describeTimeline } from './steps'

/*
 * 「加到行事曆」（規格 3.2 第 4 步）：在瀏覽器裡產生 .ics（RFC 5545），不經過後端。
 * 一個事件：出門到到家；說明欄放逐段時間軸和行程連結。
 */
export const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const enc = new TextEncoder()
/** 超過 75 個位元組就折行，續行開頭一個空白；只在完整的字之間切，中文不會被切壞 */
export function foldLine(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    const limit = out.length === 0 ? 75 : 74
    if (bytes + n > limit) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

/** url 是 null：這份沒存起來，連結會打不開，就不寫進行事曆（規格書 6.8，v0.23） */
export function icsFor({ plan, jobId, request, url, stationName, now }: { plan: Plan; jobId: string; request: PlanRequest; url: string | null; stationName: string; now: Date }): string {
  const steps = describeTimeline(plan, request.date)
  const desc = [...steps.map((s) => `${s.time} ${s.title}：${s.desc}`), ...(url ? ['', `行程連結：${url}`] : [])].join('\n')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ZeroGap//Plan//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${jobId}-${plan.rank}@zerogap`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(plan.depart_at)}`,
    `DTEND:${icsDate(plan.home_at)}`,
    `SUMMARY:${icsEscape(`電影《${plan.movie.title}》＋晚餐`)}`,
    `LOCATION:${icsEscape(plan.movie.cinema)}`,
    `DESCRIPTION:${icsEscape(`從${stationName}出發\n${desc}`)}`,
    ...(url ? [`URL:${url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
