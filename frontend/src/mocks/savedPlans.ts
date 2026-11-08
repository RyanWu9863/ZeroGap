import type { PlanRequest, PlanResult, SavedPlan } from '@/api/schemas'

/*
 * 假後端的「取餐號碼牌」（規格 7 假資料模式）：排過的結果存在這台瀏覽器的 localStorage，
 * 所以 GitHub Pages 展示站上同一台瀏覽器打得開 /p/:id；換一台就打不開（畫面會照實說）。
 * 跟真後端一樣保留 7 天；最多留 20 份，免得塞爆 localStorage。
 */
export const MOCK_SAVED_KEY = 'zg-mock-saved'
export const SAVED_TTL_MS = 7 * 86_400_000
const KEEP = 20

/** 32 碼小寫十六進位，跟後端的 job_id 一樣 */
export function newJobId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function readAll(): SavedPlan[] {
  try {
    const raw = localStorage.getItem(MOCK_SAVED_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? (list as SavedPlan[]) : []
  } catch {
    return []
  }
}

export function mockSavePlan(doc: { job_id: string; request: PlanRequest; result: PlanResult }, now = new Date()): void {
  const saved: SavedPlan = { ...doc, created_at: now.toISOString(), expires_at: new Date(now.getTime() + SAVED_TTL_MS).toISOString() }
  const rest = readAll().filter((d) => d.job_id !== doc.job_id)
  const next = [...rest, saved].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, KEEP)
  try {
    localStorage.setItem(MOCK_SAVED_KEY, JSON.stringify(next))
  } catch {
    // 存不進去（私密瀏覽、空間滿了）就算了：只是分享連結打不開，跟真後端記憶體滿時一樣
  }
}

export function mockLoadPlan(id: string, now = new Date()): SavedPlan | null {
  const doc = readAll().find((d) => d.job_id === id)
  return doc && Date.parse(doc.expires_at) > now.getTime() ? doc : null
}
