import { describe, expect, it } from 'vitest'
import { mockResult } from '@/mocks/planResult'
import { benchmarkRequest } from '@/mocks/request'
import { foldLine, icsDate, icsEscape, icsFor } from './ics'

const plan = mockResult(benchmarkRequest, false, 'c'.repeat(32)).plans[0]
const text = icsFor({ plan, jobId: 'c'.repeat(32), request: benchmarkRequest, url: 'https://example.test/p/ccc', stationName: '中壢站', now: new Date('2026-11-08T02:00:00Z') })
const unfolded = text.replace(/\r\n /g, '')

describe('行事曆檔（.ics）', () => {
  it('時間換成 UTC', () => expect(icsDate('2026-11-08T17:05:00+08:00')).toBe('20261108T090500Z'))
  it('逗號、分號、反斜線、換行要跳脫', () => expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne'))
  it('每行用 CRLF，最外層是 VCALENDAR，只有一個 VEVENT', () => {
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
  })
  it('出門到到家、編號＋方案當 UID、帶連結', () => {
    expect(unfolded).toContain(`DTSTART:${icsDate(plan.depart_at)}`)
    expect(unfolded).toContain(`DTEND:${icsDate(plan.home_at)}`)
    expect(unfolded).toContain(`UID:${'c'.repeat(32)}-${plan.rank}@zerogap`)
    expect(unfolded).toContain('URL:https://example.test/p/ccc')
    expect(unfolded).toContain(`SUMMARY:電影《${plan.movie.title}》＋晚餐`)
  })
  it('每行不超過 75 個位元組，中文不會被切成半個字', () => {
    const enc = new TextEncoder()
    text.split('\r\n').forEach((l) => expect(enc.encode(l).length).toBeLessThanOrEqual(75))
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(enc.encode(unfolded))).not.toThrow()
  })
  it('折行：續行開頭一個空白', () => {
    const long = `DESCRIPTION:${'行'.repeat(40)}`
    const folded = foldLine(long)
    expect(folded.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })
})
