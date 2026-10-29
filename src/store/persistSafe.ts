import type { z } from 'zod'

/*
 * 瀏覽器暫存的安全讀取（計畫 P1-3）。
 * 暫存可能是舊版程式存的、被手動改過、或寫到一半壞掉。讀回來時逐欄驗證：
 * 合格的欄位用暫存的值，不合格的改用預設值，不會因為一個欄位壞掉就整個畫面出錯。
 *
 * 版本規則（每個 persist 都設 version）：
 * - 只是加了選填欄位、或改預設值 → 不用升版，驗證會自動處理
 * - 欄位改名、改格式，而且舊資料值得轉換 → version 加 1，在 migrate 裡把舊格式轉成新格式
 */
export const STORAGE_VERSION = 1

/** 舊版本的資料原樣交給 merge 驗證；以後格式改了，在各 store 自己的 migrate 裡轉換 */
export const keepAsIs = (persisted: unknown) => persisted

type Fields<T> = { [K in keyof T]?: z.ZodType<T[K]> }

/** 只挑出驗證通過的欄位 */
export function pickValid<T>(persisted: unknown, fields: Fields<T>): Partial<T> {
  if (!persisted || typeof persisted !== 'object') return {}
  const out: Partial<T> = {}
  for (const key in fields) {
    const r = fields[key]!.safeParse((persisted as Record<string, unknown>)[key])
    if (r.success) out[key] = r.data
  }
  return out
}

/** 清單逐筆驗證：壞掉的那幾筆丟掉，其他留著（試用紀錄不能因為一筆壞掉就全部不見） */
export function validItems<T>(value: unknown, item: z.ZodType<T>): T[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((v) => {
    const r = item.safeParse(v)
    return r.success ? [r.data] : []
  })
}
