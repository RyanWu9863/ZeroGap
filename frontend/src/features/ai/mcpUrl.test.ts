import { describe, expect, it } from 'vitest'
import { claudeCodeCommand, mcpUrl } from './mcpUrl'

const origin = 'https://zerogap.example.tw'
describe('MCP 網址', () => {
  it('有明確設定就用它', () => expect(mcpUrl({ publicMcpUrl: 'https://api.zerogap.tw/mcp', useMock: true }, origin)).toBe('https://api.zerogap.tw/mcp'))
  it('有後端網址就接 /mcp，不會多一條斜線', () => {
    expect(mcpUrl({ apiBase: 'https://api.zerogap.tw', useMock: false }, origin)).toBe('https://api.zerogap.tw/mcp')
    expect(mcpUrl({ apiBase: 'https://api.zerogap.tw/', useMock: false }, origin)).toBe('https://api.zerogap.tw/mcp')
  })
  it('真後端、同網域：用目前網址的 origin', () => expect(mcpUrl({ apiBase: '', useMock: false }, origin)).toBe('https://zerogap.example.tw/mcp'))
  it('假資料模式又沒設定：沒有後端可以接', () => expect(mcpUrl({ useMock: true }, origin)).toBeNull())
  it('Claude Code 的指令', () => expect(claudeCodeCommand('https://api.zerogap.tw/mcp')).toBe('claude mcp add --transport http zerogap https://api.zerogap.tw/mcp'))
})
