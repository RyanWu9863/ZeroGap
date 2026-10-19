import type { TrialSession } from './trialStore'

const secs = (a?: number, b?: number) => (a != null && b != null ? Math.round((b - a) / 100) / 10 : null)

/** 一筆試用：看懂用途花幾秒（介紹頁 → 按開始）、拿到行程花幾秒（按開始 → 看到結果） */
export function sessionTimes(s: TrialSession) {
  return { understand: secs(s.startedAt, s.startClickAt), plan: secs(s.startClickAt, s.resultAt), total: secs(s.startedAt, s.resultAt) }
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
}

/** 對照 MVP 成功指標：30 秒內看懂、1 分鐘內拿到行程 */
export function summarize(list: TrialSession[]) {
  const t = list.map(sessionTimes)
  const answered = list.filter((s) => s.answers)
  return {
    count: list.length,
    avgUnderstand: avg(t.map((x) => x.understand)),
    avgPlan: avg(t.map((x) => x.plan)),
    within60: t.filter((x) => x.plan != null && x.plan <= 60).length,
    yellowCorrect: answered.filter((s) => s.answers!.yellow === 'estimate').length,
    avgWilling: avg(answered.map((s) => s.answers!.willing)),
    faster: answered.filter((s) => s.answers!.faster).length,
    answered: answered.length,
  }
}

/** 匯出成 CSV（Excel、Google 試算表都能開） */
export function toCsv(list: TrialSession[]): string {
  const head = ['id', '試做版', '開始時間', '看懂秒數', '排行程秒數', '總秒數', '黃底代表', '願意採用(1-5)', '比自己查快']
  const rows = list.map((s) => {
    const t = sessionTimes(s)
    return [s.id, s.proto, new Date(s.startedAt).toISOString(), t.understand ?? '', t.plan ?? '', t.total ?? '', s.answers?.yellow ?? '', s.answers?.willing ?? '', s.answers ? (s.answers.faster ? '是' : '否') : '']
  })
  return [head, ...rows].map((r) => r.join(',')).join('\n')
}
