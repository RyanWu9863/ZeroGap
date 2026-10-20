/*
 * SSE（Server-Sent Events）解析器。
 * 比喻：後端用「一封一封的明信片」寄進度過來，每封用空白行隔開；
 * 網路可能把一封切成好幾段送到，所以要先收進信箱，湊滿一封才拆。
 * POST /api/plans 只能用 fetch 讀（EventSource 只支援 GET），所以自己拆（規格書 6.4、6.7）。
 */
export type SseEvent = { event: string; data: string }

export class SseParser {
  private buffer = ''
  private event = ''
  private data: string[] = []

  /** 放進一段文字，回傳這段湊滿的事件 */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk
    const out: SseEvent[] = []
    // 行尾可能是 \n、\r\n 或 \r；最後一段還沒換行的先留著，等下一段
    const lines = this.buffer.split(/\r\n|\n|\r(?!$)/)
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      const e = this.line(line)
      if (e) out.push(e)
    }
    return out
  }

  /** 串流結束：還沒送出的最後一封也算（規範上要丟掉，但寬鬆一點比較好除錯） */
  end(): SseEvent[] {
    const out = this.buffer ? this.push('\n') : []
    const e = this.line('')
    return e ? [...out, e] : out
  }

  private line(line: string): SseEvent | null {
    if (line === '') {
      if (this.data.length === 0) {
        this.event = ''
        return null
      }
      const e = { event: this.event || 'message', data: this.data.join('\n') }
      this.event = ''
      this.data = []
      return e
    }
    if (line.startsWith(':')) return null // 註解，後端每 15 秒送一次當心跳
    const i = line.indexOf(':')
    const field = i < 0 ? line : line.slice(0, i)
    let value = i < 0 ? '' : line.slice(i + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') this.event = value
    else if (field === 'data') this.data.push(value)
    return null
  }
}

/** 把 fetch 的 body 一段一段讀出來、拆成事件 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      yield* parser.push(decoder.decode(value, { stream: true }))
    }
    yield* parser.push(decoder.decode())
    yield* parser.end()
  } finally {
    reader.releaseLock()
  }
}
