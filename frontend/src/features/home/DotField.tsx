import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import type { Theme } from '@/shared/theme/theme'
import { dotCount, layoutDots, MAX_DOTS, PHONE_BREAKPOINT, type DotStats } from './dotModel'

/*
 * 首頁點陣剪枝動畫（規格 4.2）：一個點＝一種組合（太多時一點代表好幾種）。
 * 先全部亮起 → 接不上的熄掉 → 剩下的變灰，只留給你的方案發光。
 * 用 Canvas 畫：上萬個 DOM 節點會拖慢手機；正方形 fillRect 比畫圓快。
 */

/** 點距與點的大小（CSS px） */
const GAP = 5
const DOT = 2
/** 最後留下的方案點放大到多大、外圈光暈多大 */
const PLAN_DOT = 6
const GLOW = 14

/* 時間軸（毫秒，t 從 0 開始） */
/** 0–600：全部點從透明淡入成 --zg-flow、alpha 0.55 */
const FADE_IN = [0, 600] as const
/** 900–2100：stage 0（接不上的）變成 --muted-foreground、alpha 0.18 */
const PRUNE = [900, 2100] as const
/** 2400–3300：stage 1 變灰、alpha 0.3；stage 2（給你的方案）放大、全亮、加光暈 */
const PICK = [2400, 3300] as const
/** 這之後停止重畫，停在最後一格 */
const END = PICK[1]

const ALPHA_ON = 0.55
const ALPHA_PRUNED = 0.18
const ALPHA_FEASIBLE = 0.3

/** t 在 start→end 之間走到哪裡，回傳 0～1（之前是 0、之後是 1，中間線性） */
function mix(t: number, start: number, end: number): number {
  if (t <= start) return 0
  if (t >= end) return 1
  return (t - start) / (end - start)
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

type Rgba = [number, number, number, number]

/** 把任何 CSS 顏色轉成 rgba：交給 canvas 解析，讀回來一定是 #rrggbb 或 rgba(r, g, b, a) */
function toRgba(ctx: CanvasRenderingContext2D, css: string): Rgba {
  ctx.fillStyle = '#000'
  ctx.fillStyle = css || '#000'
  const v = String(ctx.fillStyle)
  if (v.startsWith('#')) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1]
  const m = v.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]
  return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 1]
}

function readColors(ctx: CanvasRenderingContext2D) {
  const s = getComputedStyle(document.documentElement)
  const get = (name: string) => toRgba(ctx, s.getPropertyValue(name).trim())
  return { flow: get('--zg-flow'), muted: get('--muted-foreground'), glow: get('--zg-glow') }
}

const rgba = (c: Rgba, alpha: number) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`
const mixColor = (a: Rgba, b: Rgba, k: number): Rgba => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), 1]

type Geometry = {
  w: number
  h: number
  cols: number
  offX: number
  offY: number
  perDot: number
  /** 每一層（stage 0／1／2）的點的編號 */
  byStage: [Uint32Array, Uint32Array, Uint32Array]
}

function buildGeometry(stats: DotStats, w: number, h: number): Geometry {
  const cols = Math.max(1, Math.floor(w / GAP))
  const layout = layoutDots(stats, dotCount(w, h, GAP, w < PHONE_BREAKPOINT ? MAX_DOTS.phone : MAX_DOTS.desktop))
  const rows = Math.ceil(layout.n / cols)
  const counts = [0, 0, 0]
  for (let i = 0; i < layout.n; i++) counts[layout.stage[i]]++
  const byStage: Geometry['byStage'] = [new Uint32Array(counts[0]), new Uint32Array(counts[1]), new Uint32Array(counts[2])]
  const fill = [0, 0, 0]
  for (let i = 0; i < layout.n; i++) {
    const s = layout.stage[i]
    byStage[s][fill[s]++] = i
  }
  // 點陣放在畫布正中間
  return {
    w,
    h,
    cols,
    offX: (w - cols * GAP) / 2 + (GAP - DOT) / 2,
    offY: Math.max(0, (h - rows * GAP) / 2) + (GAP - DOT) / 2,
    perDot: layout.perDot,
    byStage,
  }
}

function draw(ctx: CanvasRenderingContext2D, g: Geometry, t: number) {
  const { flow, muted, glow } = readColors(ctx)
  const fade = mix(t, FADE_IN[0], FADE_IN[1])
  const prune = mix(t, PRUNE[0], PRUNE[1])
  const pick = mix(t, PICK[0], PICK[1])
  ctx.clearRect(0, 0, g.w, g.h)

  const at = (i: number) => [g.offX + (i % g.cols) * GAP, g.offY + Math.floor(i / g.cols) * GAP] as const
  const square = (ids: Uint32Array, color: Rgba, alpha: number, size: number) => {
    if (ids.length === 0 || alpha <= 0) return
    ctx.fillStyle = rgba(color, alpha)
    const shift = (size - DOT) / 2
    for (const i of ids) {
      const [x, y] = at(i)
      ctx.fillRect(x - shift, y - shift, size, size)
    }
  }

  // stage 0：接不上的，熄掉
  square(g.byStage[0], mixColor(flow, muted, prune), fade * lerp(ALPHA_ON, ALPHA_PRUNED, prune), DOT)
  // stage 1：每段接得上、但沒選上的，變灰
  square(g.byStage[1], mixColor(flow, muted, pick), fade * lerp(ALPHA_ON, ALPHA_FEASIBLE, pick), DOT)
  // stage 2：給你的方案，先畫光暈再畫點
  if (pick > 0) {
    ctx.fillStyle = rgba(glow, glow[3] * pick)
    for (const i of g.byStage[2]) {
      const [x, y] = at(i)
      ctx.beginPath()
      ctx.arc(x + DOT / 2, y + DOT / 2, GLOW / 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  square(g.byStage[2], flow, fade * lerp(ALPHA_ON, 1, pick), lerp(DOT, PLAN_DOT, pick))
}

/** 首頁點陣（default export，給 lazy 用）。外層固定高度，載入前後版面不跳 */
export default function DotField({ stats, theme }: { stats: DotStats; theme: Theme }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  /** 動畫走到哪（毫秒）；卸載前一直留著，stats／尺寸／外觀變了也不重播 */
  const tRef = useRef(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width)
      const h = Math.round(entry.contentRect.height)
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }))
    })
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  const { combinations, feasible, plans } = stats
  const geo = useMemo(
    () => (size && size.w > 0 && size.h > 0 ? buildGeometry({ combinations, feasible, plans }, size.w, size.h) : null),
    [size, combinations, feasible, plans],
  )

  // theme 也列進來：夜／日切換時重畫一次（顏色在下一個畫面才讀，那時 <html> 已經換好）
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !geo) return
    const dpr = window.devicePixelRatio || 1
    const pw = Math.round(geo.w * dpr)
    const ph = Math.round(geo.h * dpr)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (reduce) tRef.current = END
    let raf = 0
    const frame = (now: number) => {
      let t = tRef.current
      if (t < END) {
        startRef.current ??= now - t
        t = Math.min(END, now - startRef.current)
        tRef.current = t
      }
      draw(ctx, geo, t)
      if (t < END) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [geo, theme, reduce])

  return (
    <div>
      <div ref={boxRef} className="h-56 w-full sm:h-72">
        <canvas ref={canvasRef} aria-hidden className="block size-full" />
      </div>
      <p className="mt-2 h-4 text-xs leading-4 text-muted-foreground">
        {geo ? `每點約代表 ${Math.round(geo.perDot).toLocaleString('zh-TW')} 種組合` : null}
      </p>
    </div>
  )
}
