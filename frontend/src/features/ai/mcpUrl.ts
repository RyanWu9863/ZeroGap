/** MCP 網址從哪來：明確設定 > 後端網址 + /mcp > 同網域 /mcp；假資料模式沒設定時回 null（展示站沒有後端） */
export function mcpUrl(env: { publicMcpUrl?: string; apiBase?: string; useMock: boolean }, origin: string): string | null {
  const explicit = env.publicMcpUrl?.trim()
  if (explicit) return explicit
  if (env.useMock) return null
  const base = (env.apiBase || origin).replace(/\/+$/, '')
  return `${base}/mcp`
}

export const claudeCodeCommand = (url: string) => `claude mcp add --transport http zerogap ${url}`
