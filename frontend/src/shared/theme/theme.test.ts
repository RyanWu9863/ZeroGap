import { describe, expect, it } from 'vitest'
import { nextPref, resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('跟著手機：手機是深色就用夜', () => expect(resolveTheme('system', true)).toBe('night'))
  it('跟著手機：手機是淺色就用日', () => expect(resolveTheme('system', false)).toBe('day'))
  it('手動選了就不管手機', () => {
    expect(resolveTheme('day', true)).toBe('day')
    expect(resolveTheme('night', false)).toBe('night')
  })
})

describe('nextPref', () => {
  it('按一下依序換：跟著手機 → 夜 → 日 → 跟著手機', () => {
    expect(nextPref('system')).toBe('night')
    expect(nextPref('night')).toBe('day')
    expect(nextPref('day')).toBe('system')
  })
})
