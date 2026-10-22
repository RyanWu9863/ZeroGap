/*
 * 時間工具。後端的時間是 ISO 8601＋08:00（規格書 6.1）；
 * 畫面一律用台灣時間顯示，不管使用者的電腦設在哪個時區。
 */
const TZ = 'Asia/Taipei'
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** "2026-10-30T17:05:00+08:00" → "17:05" */
export const clock = (iso: string) => clockFmt.format(new Date(iso))

/** 台灣時間的日期 "2026-10-30" */
export const taipeiDate = (iso: string) => dayFmt.format(new Date(iso))

/** 跨過午夜的時間加「隔天」：行程最晚可以到隔天凌晨 02:00（規格書 6.4） */
export const clockOn = (iso: string, date: string) => (taipeiDate(iso) > date ? `隔天 ${clock(iso)}` : clock(iso))

/** "2026-10-21T09:36:45+08:00" → "10/21 09:36"（資料更新時間用） */
export const stamp = (iso: string) => `${taipeiDate(iso).slice(5).replace('-', '/')} ${clock(iso)}`

export const minutesBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 60_000)

export const addMinutes = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString()

/** 台灣現在幾點幾分（換算成當天第幾分鐘）和日期 */
export function taipeiNow(now = new Date()) {
  const [h, m] = clockFmt.format(now).split(':').map(Number)
  return { date: dayFmt.format(now), minutes: h * 60 + m }
}
