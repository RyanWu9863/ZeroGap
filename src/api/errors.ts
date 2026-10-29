import type { z } from 'zod'

/*
 * 跟後端溝通出錯時，分成四種（計畫 P1-2），畫面依種類講不同的白話：
 * - network：連不上（沒網路、服務沒開）
 * - timeout：等太久
 * - http：服務有回應，但回傳錯誤代碼（例如 500、422）
 * - format：有回應，但資料格式和前端的合約對不上（zod 驗貨沒過）
 */
export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'format'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

/** 值得自動再試一次嗎？連不上、等太久、伺服器 5xx 才值得；格式錯、4xx 再試也一樣 */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.kind === 'network' || err.kind === 'timeout') return true
  return err.kind === 'http' && (err.status ?? 0) >= 500
}

/** zod 驗貨：沒過就丟 format 錯誤；開發模式在 console 印出是哪些欄位不對，方便和後端對照 */
export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown, what: string): z.infer<T> {
  const r = schema.safeParse(data)
  if (r.success) return r.data
  if (import.meta.env.DEV) console.error(`[API] ${what} 的資料格式和合約對不上`, r.error.issues)
  throw new ApiError('format', `${what} 的資料格式和合約對不上`)
}

/** 給畫面用的白話標題和說明 */
export function errorText(err: unknown): { title: string; detail: string } {
  const kind = err instanceof ApiError ? err.kind : 'network'
  switch (kind) {
    case 'timeout':
      return { title: '等太久了，還沒收到回應', detail: '排程服務可能比較忙。你填的條件都還在，稍等一下再試一次。' }
    case 'format':
      return { title: '收到的資料看不懂', detail: '這通常是前端和後端版本對不上，再試也不會好，請通知開發組。' }
    case 'http':
      return (err as ApiError).status && (err as ApiError).status! < 500
        ? { title: '這組條件送不出去', detail: '條件可能有不合規定的地方，回去改一下再試。' }
        : { title: '排程服務出了點問題', detail: '你填的條件都還在，稍等一下再試一次。' }
    default:
      return { title: '現在連不上排程服務', detail: '你填的條件都還在，稍等一下再試一次。' }
  }
}
