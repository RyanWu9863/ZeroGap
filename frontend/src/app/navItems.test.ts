import { describe, expect, it } from 'vitest'
import { activeNav, NAV_ITEMS } from './navItems'

describe('導覽四顆（規格 3.1）', () => {
  it('順序：排行程、方法、AI 助理、關於', () => {
    expect(NAV_ITEMS.map((n) => n.label)).toEqual(['排行程', '方法', 'AI 助理', '關於'])
    expect(NAV_ITEMS.map((n) => n.to)).toEqual(['/plan/1', '/method', '/ai', '/about'])
  })
  it.each([
    ['/plan/2', '/plan/1'],
    ['/result', '/plan/1'],
    ['/p/0123456789abcdef0123456789abcdef', '/plan/1'],
    ['/method', '/method'],
    ['/ai', '/ai'],
    ['/about', '/about'],
    ['/', null],
    ['/behind', null],
    ['/aix', null],
  ])('%s → %s', (path, to) => expect(activeNav(path)).toBe(to))
})
