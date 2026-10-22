import { describe, expect, it } from 'vitest'
import { readSse, SseParser } from './sse'

describe('SseParser（規格書 6.4）', () => {
  it('一封切成好幾段送到，湊滿才拆', () => {
    const p = new SseParser()
    expect(p.push('event: queued\nda')).toEqual([])
    expect(p.push('ta: {"position":2}\n')).toEqual([])
    expect(p.push('\n')).toEqual([{ event: 'queued', data: '{"position":2}' }])
  })
  it('行尾是 \r\n，而且 \r 和 \n 被切在兩段', () => {
    const p = new SseParser()
    expect(p.push('event: progress\r')).toEqual([])
    expect(p.push('\ndata: {"stage":"filtering"}\r\n\r\n')).toEqual([{ event: 'progress', data: '{"stage":"filtering"}' }])
  })
  it('註解（心跳）不算事件', () => {
    const p = new SseParser()
    expect(p.push(': ping\n\n: ping\n\nevent: result\ndata: {}\n\n')).toEqual([{ event: 'result', data: '{}' }])
  })
  it('多行 data 用換行接起來；沒有 event 欄位就是 message', () => {
    const p = new SseParser()
    expect(p.push('data: a\ndata: b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }])
  })
  it('一段裡有兩封', () => {
    const p = new SseParser()
    expect(p.push('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n').map((e) => e.event)).toEqual(['a', 'b'])
  })
  it('串流結束時還沒空行的最後一封也送出', () => {
    const p = new SseParser()
    p.push('event: error\ndata: {"code":"X"}')
    expect(p.end()).toEqual([{ event: 'error', data: '{"code":"X"}' }])
  })
})

describe('readSse', () => {
  it('中文字被切在位元組中間也拆得對', async () => {
    const bytes = new TextEncoder().encode('event: error\ndata: {"message":"沒有接得上的組合"}\n\n')
    const cut = 30
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut))
        c.enqueue(bytes.slice(cut))
        c.close()
      },
    })
    const out = []
    for await (const e of readSse(body)) out.push(e)
    expect(out).toEqual([{ event: 'error', data: '{"message":"沒有接得上的組合"}' }])
  })
})
