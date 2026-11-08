import { describe, expect, it } from 'vitest'
import { PlanResult } from './schemas'
import { ApiError, errorText, isRetryable, parseOrThrow } from './errors'

describe('API 錯誤分類（P1-2）', () => {
  it('格式對不上 → format，而且不值得再試', () => {
    let err: unknown
    try {
      parseOrThrow(PlanResult, { plans: 'x' }, '規劃結果')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).kind).toBe('format')
    expect(isRetryable(err)).toBe(false)
    expect(errorText(err).title).toBe('收到的資料看不懂')
  })
  it('連不上、等太久、5xx 才自動再試；4xx 不再試', () => {
    expect(isRetryable(new ApiError('network', 'x'))).toBe(true)
    expect(isRetryable(new ApiError('timeout', 'x'))).toBe(true)
    expect(isRetryable(new ApiError('http', 'x', 503))).toBe(true)
    expect(isRetryable(new ApiError('http', 'x', 422))).toBe(false)
  })
  it('不認得的錯誤當成連不上', () => expect(errorText(new Error('?')).title).toBe('現在連不上排程服務'))
})
