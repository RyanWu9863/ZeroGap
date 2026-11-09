/*
 * 進場動畫（開場）：一條線把空檔接起來。
 *
 * 散落的點（當天所有組合）→ 剪枝後排成一條路線（步行、電影、晚餐、捷運、到家）→ 段與段之間的空檔歸零
 * → 路線彎成錶盤、刻度亮起、畫出 ZG → 錶圈往外擴張，露出網頁。對應核心價值「零空檔：保證接得上」（決策 Q36）。
 *
 * 這個檔案不經過 React：vite.config.ts 的 inlineSplash 會把它編譯、壓縮後直接寫進 index.html，
 * 所以手機掃 QR 碼後、網頁程式還在下載時動畫就開始播，等待的時間就是動畫本身。
 * 因此這裡**不能 import 任何東西**，所有 export 都要寫在行首（外掛靠這兩點把它變成一般的 script）。
 *
 * 上半部是純函式（splash.test.ts 測）；下半部 boot() 負責畫面。
 */

export type Variant = 'full' | 'short'

export interface SplashEnv {
  path: string
  base: string
  search: string
  /** 這個分頁已經播過 */
  seen: boolean
  reducedMotion: boolean
  /** Playwright 等自動化工具 */
  webdriver: boolean
}

/** 這個分頁播過了（sessionStorage）：同一個分頁換頁、重新整理都不再播 */
export const SEEN_KEY = 'zg-intro-seen'

/** 完整版（首頁）和縮短版（分享行程等其他頁）的總長度，單位秒 */
export const TOTAL: Record<Variant, number> = { full: 3.2, short: 1.15 }

/** 錶盤畫完、準備展開的時間點：網頁還沒準備好就停在這裡等 */
export const HOLD_AT: Record<Variant, number> = { full: 2.8, short: 0.8 }

/** 網頁一直沒回報準備好時，最多等這麼久（秒）就照樣展開，底下會是錯誤頁或載入中 */
export const MAX_WAIT = 8

/** 首頁播完整版，其他頁播縮短版；看過、減少動態、自動化測試不播。?intro=1 強制播（測試用），?intro=0 不播 */
export function decideSplash(env: SplashEnv): Variant | null {
  const q = new URLSearchParams(env.search).get('intro')
  if (q === '0' || env.reducedMotion) return null
  const forced = q === '1'
  if (!forced && (env.seen || env.webdriver)) return null
  const b = env.base.replace(/\/$/, '')
  const rel = env.path.startsWith(b) ? env.path.slice(b.length) : env.path
  return rel === '' || rel === '/' || rel === '/index.html' ? 'full' : 'short'
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
const easeOut = (x: number) => 1 - (1 - x) ** 3
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

export interface FrameState {
  /** 有沒有點陣（縮短版沒有） */
  particles: boolean
  /** 點陣漂移的進度 */
  drift: number
  /** 被淘汰的點還剩多少（1＝全部看得到） */
  noise: number
  /** 留下來的點排成路線的進度 */
  gather: number
  /** 路線每段的名稱 */
  labels: number
  /** 段與段之間的空檔（1＝全開，0＝歸零） */
  gap: number
  /** 空檔計時器 */
  readout: number
  /** 從比對的說明換成 GAP 計時器 */
  readoutGap: boolean
  /** 沿著路線跑過去的光點 */
  pulse: number
  /** 路線彎成圓（0＝直線，1＝圓） */
  bend: number
  /** 圓畫了多少（縮短版從無到有畫一圈；完整版一直是 1） */
  ring: number
  /** 60 個刻度依序亮起 */
  ticks: number
  /** ZG 筆畫 */
  zg: number
  /** ZEROGAP 字樣 */
  word: number
  /** 「點一下略過」 */
  hint: number
  /** 圓形視窗展開（1＝完全看到網頁） */
  iris: number
}

/** 第 t 秒每一幕的進度（0～1） */
export function frameState(variant: Variant, t: number): FrameState {
  if (variant === 'short') {
    return {
      particles: false,
      drift: 1,
      noise: 0,
      gather: 1,
      labels: 0,
      gap: 0,
      readout: 0,
      readoutGap: true,
      pulse: 0,
      bend: 1,
      ring: easeInOut(span(t, 0, 0.4)),
      ticks: span(t, 0.15, 0.55),
      zg: easeOut(span(t, 0.3, 0.7)),
      word: easeOut(span(t, 0.45, 0.7)),
      hint: 0,
      iris: easeInOut(span(t, 0.8, 1.15)),
    }
  }
  const bend = easeInOut(span(t, 1.8, 2.35))
  const iris = easeInOut(span(t, 2.8, 3.2))
  return {
    particles: true,
    drift: span(t, 0, 0.6),
    noise: 1 - easeOut(span(t, 0.4, 1.1)),
    gather: easeInOut(span(t, 0.55, 1.25)),
    labels: easeOut(span(t, 1.25, 1.45)) * (1 - bend),
    gap: 1 - easeInOut(span(t, 1.35, 1.75)),
    readout: easeOut(span(t, 0.15, 0.4)) * (1 - easeOut(span(t, 1.85, 2.05))),
    readoutGap: t >= 1.25,
    pulse: span(t, 1.5, 1.95),
    bend,
    ring: 1,
    ticks: span(t, 2.1, 2.6),
    zg: easeOut(span(t, 2.25, 2.7)),
    word: easeOut(span(t, 2.45, 2.7)),
    hint: easeOut(span(t, 0.9, 1.2)) * (1 - iris),
    iris,
  }
}

/** 往前走 dt 秒；網頁還沒準備好時停在 HOLD_AT，不展開到半空的頁面 */
export function advance(variant: Variant, t: number, dt: number, ready: boolean): number {
  if (ready) return t + dt
  return Math.min(t + dt, Math.max(t, HOLD_AT[variant]))
}

/** 點一下略過：跳到錶盤畫完的那一格，不倒退；準備好了就接著展開，還沒好就在錶盤上等（advance 負責） */
export function skipTo(variant: Variant, t: number): number {
  return Math.max(t, HOLD_AT[variant])
}

/** 空檔計時器：全開是 12 秒，收合後 00:00 */
export function readoutSeconds(gap: number): string {
  return `00:${String(Math.round(clamp01(gap) * 12)).padStart(2, '0')}`
}

/* ───────────────────────── 以下是畫面 ───────────────────────── */

declare global {
  interface Window {
    /** 網頁畫出第一個畫面了（src/splash/ready.ts 設定） */
    __zgReady?: boolean
  }
}

// 夜色的品牌色（和 index.css 的 [data-theme="night"] 一樣）：開場一律用夜色，展開後才是使用者的主題
const BG = '#0b1016'
const CYAN = '#62d6e8'
const AMBER = '#ffb547'
const MUTED = '#8a9aa9'
const FG = '#eaf1f6'
// 網頁字型還沒下載，用系統字
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace'
const SANS = '"PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif'

/** 路線上的點數和五段的分界（步行、電影、晚餐、捷運、到家） */
const N = 120
const SEG = [0, 24, 48, 72, 96, 120]
const LABELS = ['步行', '電影', '晚餐', '捷運', '到家']
/** 和 shared/brand/Logo.tsx 的 ZG 同一條路徑（100×100 座標） */
const ZG_PATH = 'M27 34h22L30 66h20M70 40a14 14 0 1 0 2 16h-12'
const ZG_LEN = 180

/** 固定種子的亂數：每次打開散點的樣子都一樣 */
function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function segmentOf(i: number) {
  for (let k = 0; k < 5; k++) if (i < SEG[k + 1]) return k
  return 4
}

export function boot(base: string): void {
  let seen = false
  try {
    seen = sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    // 私密模式等情況拿不到 sessionStorage：當作沒看過
  }
  const variant = decideSplash({
    path: location.pathname,
    base,
    search: location.search,
    seen,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    webdriver: navigator.webdriver === true,
  })
  if (!variant) return
  try {
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    // 同上
  }

  const doc = document
  const html = doc.documentElement
  const root = doc.createElement('div')
  root.id = 'zg-splash'
  root.dataset.variant = variant
  root.setAttribute('aria-hidden', 'true')
  root.style.cssText = `position:fixed;inset:0;z-index:2147483000;background:${BG};touch-action:none;cursor:pointer;-webkit-tap-highlight-color:transparent`
  const cv = doc.createElement('canvas')
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  const hint = doc.createElement('p')
  hint.textContent = '點一下略過'
  hint.style.cssText = `position:absolute;left:0;right:0;bottom:max(28px,calc(env(safe-area-inset-bottom,0px) + 20px));margin:0;text-align:center;font:12px/1 ${SANS};letter-spacing:.3em;color:${MUTED};opacity:0;pointer-events:none`
  root.append(cv, hint)
  doc.body.prepend(root)
  const ctx = cv.getContext('2d')
  if (!ctx) {
    root.remove()
    return
  }

  // 網址列跟著變深色，捲動先鎖住
  const meta = doc.querySelector('meta[name="theme-color"]')
  // 播放中網頁（useApplyTheme）也會改網址列顏色：記下它最後要的顏色，播完再換回去
  let appTheme = meta?.getAttribute('content') ?? null
  meta?.setAttribute('content', BG)
  function holdThemeColor() {
    const cur = meta?.getAttribute('content') ?? null
    if (meta && cur !== BG) {
      appTheme = cur
      meta.setAttribute('content', BG)
    }
  }
  const prevOverflow = html.style.overflow
  html.style.overflow = 'hidden'

  // 版面：每次視窗大小改變就重算
  let W = 0
  let H = 0
  let CX = 0
  let CY = 0
  let R = 0
  let LX = 0
  let LL = 0
  let GAP_PX = 0
  let maxR = 0
  /** 大螢幕的放大倍數：字、線寬、間距一起放大（手機是 1） */
  let k = 1
  const rnd = seeded(20261109)
  const COUNT = 640
  const dots = Array.from({ length: COUNT }, (_, i) => ({
    x: rnd(),
    y: rnd(),
    vx: (rnd() - 0.5) * 36,
    vy: (rnd() - 0.5) * 36,
    s: rnd() * 1.4 + 0.5,
    // 前 N 個是留下來的點，各自對應路線上的一個位置
    k: i < N ? i : -1,
  }))
  const zg = new Path2D(ZG_PATH)

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = window.innerWidth
    H = window.innerHeight
    cv.width = Math.round(W * dpr)
    cv.height = Math.round(H * dpr)
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    k = Math.max(1, Math.min(1.5, Math.min(W, H) / 400))
    CX = W / 2
    CY = H * (W < 640 ? 0.44 : 0.46)
    R = Math.max(52, Math.min(130, Math.min(W, H) * 0.17))
    LL = Math.min(W - 64, 560 * k)
    LX = CX - LL / 2
    GAP_PX = Math.min(16 * k, LL * 0.045)
    maxR = Math.hypot(Math.max(CX, W - CX), Math.max(CY, H - CY))
  }
  layout()

  function routePoints(s: FrameState) {
    const gapPx = GAP_PX * s.gap
    const tot = LL - gapPx * 4
    const pts: [number, number][] = []
    const b = s.bend
    for (let i = 0; i < N; i++) {
      const lx = LX + (i / (N - 1)) * tot + segmentOf(i) * gapPx
      if (b < 1e-4) {
        pts.push([lx, CY])
        continue
      }
      // 路線捲成圓：曲率從 0 慢慢加到 1/R，長度從直線長變成圓周長，最上面那一點從線上移到圓頂。
      // 完整版從路線中間往兩邊捲（兩端在圓底接起來）；縮短版從圓頂順時針畫一圈。
      const kappa = b / R
      const len = LL + (2 * Math.PI * R - LL) * b
      const along = variant === 'short' ? (i / N) * len : ((lx - LX) / LL - 0.5) * len
      const th = along * kappa
      const top = CY - R * b
      pts.push([CX + Math.sin(th) / kappa, top + (1 - Math.cos(th)) / kappa])
    }
    return pts
  }

  function strokeRoute(pts: [number, number][], s: FrameState) {
    const c = ctx!
    const shown = Math.max(2, Math.round(N * s.ring))
    const closed = s.bend >= 0.999 && s.ring >= 0.999
    const pieces: [number, number][] = s.gap > 0.002 ? [0, 1, 2, 3, 4].map((k) => [SEG[k], SEG[k + 1] - 1]) : [[0, shown - 1]]
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.strokeStyle = CYAN
    for (const pass of [0, 1]) {
      // 第一次畫寬的光暈，第二次畫細的實線
      c.lineWidth = (pass === 0 ? 7 : 2.4) * k
      c.globalAlpha = pass === 0 ? 0.16 : 1
      c.shadowColor = CYAN
      c.shadowBlur = pass === 0 ? 0 : 12 * k
      for (const [a, b] of pieces) {
        const end = Math.min(b, shown - 1)
        if (end <= a) continue
        c.beginPath()
        c.moveTo(pts[a][0], pts[a][1])
        for (let i = a + 1; i <= end; i++) c.lineTo(pts[i][0], pts[i][1])
        if (closed && pieces.length === 1) c.closePath()
        c.stroke()
      }
    }
    c.shadowBlur = 0
    c.globalAlpha = 1
  }

  let spin = 0
  function draw(s: FrameState) {
    const c = ctx!
    c.globalCompositeOperation = 'source-over'
    c.clearRect(0, 0, W, H)
    c.fillStyle = BG
    c.fillRect(0, 0, W, H)

    // 細網格：像工程圖的底紙
    c.strokeStyle = 'rgba(98,214,232,0.05)'
    c.lineWidth = 1
    c.beginPath()
    for (let x = (CX % 28) - 0.5; x < W; x += 28) {
      c.moveTo(x, 0)
      c.lineTo(x, H)
    }
    for (let y = (CY % 28) - 0.5; y < H; y += 28) {
      c.moveTo(0, y)
      c.lineTo(W, y)
    }
    c.stroke()

    const pts = routePoints(s)
    const dt = s.drift * 0.6

    // ① ② 點陣：淘汰的點淡掉，留下的點飛到路線上
    if (s.particles && s.gather < 1) {
      // 同色的點合成一條路徑，一種顏色只 fill 一次（低階手機也順）
      const grey = new Path2D()
      const cyan = new Path2D()
      for (const p of dots) {
        const x0 = p.x * W + p.vx * dt
        const y0 = p.y * H + p.vy * dt
        if (p.k < 0) {
          if (s.noise > 0) grey.rect(x0, y0, p.s, p.s)
          continue
        }
        const [tx, ty] = pts[p.k]
        const x = x0 + (tx - x0) * s.gather
        const y = y0 + (ty - y0) * s.gather
        const r = 1.1 + p.s * 0.4
        cyan.moveTo(x + r, y)
        cyan.arc(x, y, r, 0, Math.PI * 2)
      }
      if (s.noise > 0) {
        c.globalAlpha = 0.55 * s.noise
        c.fillStyle = MUTED
        c.fill(grey)
      }
      c.globalAlpha = 0.9
      c.fillStyle = CYAN
      c.fill(cyan)
      c.globalAlpha = 1
    }

    // ⑤ 展開時鏡頭穿過錶盤：路線、錶盤、字樣一起以中心放大（網格不動，有景深）
    const z = 1 + s.iris * s.iris * (maxR / R + 1)
    c.save()
    c.translate(CX, CY)
    c.scale(z, z)
    c.translate(-CX, -CY)

    if (s.gather >= 1) {
      strokeRoute(pts, s)

      // ③ 空檔：段與段之間的橘色缺口，收合後消失
      if (s.gap > 0.02) {
        const gapPx = GAP_PX * s.gap
        const tot = LL - gapPx * 4
        c.fillStyle = AMBER
        c.globalAlpha = Math.min(1, s.gap * 2)
        for (let j = 1; j < 5; j++) {
          const x = LX + (SEG[j] / (N - 1)) * tot + (j - 1) * gapPx
          c.fillRect(x + 3 * k, CY - k, Math.max(0, gapPx - 6 * k), 2 * k)
        }
        c.globalAlpha = 1
      }

      // 路線每段的名稱
      if (s.labels > 0) {
        c.globalAlpha = s.labels
        c.fillStyle = MUTED
        c.font = `${11 * k}px ${SANS}`
        c.textAlign = 'center'
        for (let j = 0; j < 5; j++) {
          const a = pts[SEG[j]]
          const b = pts[SEG[j + 1] - 1]
          c.fillText(LABELS[j], (a[0] + b[0]) / 2, CY + 22 * k)
        }
        c.globalAlpha = 1
      }

      // 空檔歸零後，一個光點沿著路線跑過去：整條都接上了
      if (s.pulse > 0 && s.pulse < 1) {
        const [px, py] = pts[Math.min(N - 1, Math.floor(s.pulse * N))]
        c.globalAlpha = Math.sin(Math.PI * s.pulse)
        c.fillStyle = '#ffffff'
        c.shadowColor = CYAN
        c.shadowBlur = 18 * k
        c.beginPath()
        c.arc(px, py, 3 * k, 0, Math.PI * 2)
        c.fill()
        c.shadowBlur = 0
        c.globalAlpha = 1
      }
    }

    // 上方的說明：先「比對中」，再換成 GAP 計時器
    if (s.readout > 0) {
      c.globalAlpha = s.readout
      c.textAlign = 'center'
      c.fillStyle = MUTED
      if (!s.readoutGap) {
        c.font = `${12 * k}px ${SANS}`
        c.fillText('比對場次 · 餐廳 · 班次', CX, CY - 56 * k)
      } else {
        c.font = `${11 * k}px ${MONO}`
        c.fillText('G A P', CX, CY - 62 * k)
        c.font = `500 ${26 * k}px ${MONO}`
        c.fillStyle = s.gap < 0.02 ? CYAN : AMBER
        c.fillText(readoutSeconds(s.gap), CX, CY - 32 * k)
      }
      c.globalAlpha = 1
    }

    // ④ 錶盤：刻度依序亮起，接著畫出 ZG
    if (s.bend > 0.6 && (s.ticks > 0 || s.zg > 0)) {
      const sc = R / 46
      c.save()
      c.translate(CX, CY)
      c.scale(sc, sc)
      c.strokeStyle = CYAN
      c.shadowColor = CYAN
      // 刻度不加光暈（60 條各算一次模糊太貴），只有 ZG 加
      c.shadowBlur = 0
      for (let i = 0; i < 60; i++) {
        const a = clamp01((s.ticks * 68 - i) / 8)
        if (a <= 0) continue
        const major = i % 15 === 0
        const five = i % 5 === 0
        c.save()
        c.rotate((i * Math.PI) / 30 + spin)
        c.globalAlpha = a * (five ? 1 : 0.5)
        c.lineWidth = major ? 2 : 0.8
        c.beginPath()
        c.moveTo(0, -50 + (major ? 1.5 : 4) + 2)
        c.lineTo(0, -50 + (five ? 8.5 : 6.5) + 2)
        c.stroke()
        c.restore()
      }
      if (s.zg > 0) {
        c.translate(-50, -50)
        c.globalAlpha = 1
        c.lineWidth = 5
        c.lineCap = 'square'
        c.lineJoin = 'miter'
        c.setLineDash([ZG_LEN, ZG_LEN])
        c.lineDashOffset = ZG_LEN * (1 - s.zg)
        c.shadowBlur = 6
        c.stroke(zg)
        c.setLineDash([])
      }
      c.restore()
    }

    // ZEROGAP 字樣
    if (s.word > 0) {
      const y = CY + R + 38 * k + (1 - s.word) * 6
      c.globalAlpha = s.word
      c.textAlign = 'center'
      c.fillStyle = FG
      c.font = `600 ${15 * k}px ${MONO}`
      c.fillText('Z E R O G A P', CX, y)
      c.fillStyle = MUTED
      c.font = `${12 * k}px ${SANS}`
      c.fillText('零空檔 · 每一段都接得上', CX, y + 22 * k)
      c.globalAlpha = 1
    }
    c.restore()

    // 錶圈裡打開一個圓形視窗，跟著放大到整個畫面，露出底下的網頁
    if (s.iris > 0) {
      c.globalCompositeOperation = 'destination-out'
      c.beginPath()
      c.arc(CX, CY, R * 0.9 * z * Math.min(1, s.iris * 4), 0, Math.PI * 2)
      c.fill()
      c.globalCompositeOperation = 'source-over'
    }

    hint.style.opacity = String(s.hint)
  }

  let t = 0
  let last = performance.now()
  const started = last
  let opened = false
  const ready = () => window.__zgReady === true || (performance.now() - started) / 1000 > MAX_WAIT

  function skip() {
    t = skipTo(variant!, t)
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') skip()
  }
  root.addEventListener('pointerdown', skip)
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', layout)

  // 播放中底下的網頁先設成 inert：按 Tab 不會跑到看不見的連結上（#root 在這段 script 後面才出現，每一格檢查一次）
  let inerted: HTMLElement | null = null
  function holdFocus() {
    if (inerted) return
    const app = doc.getElementById('root')
    if (app && !app.inert) {
      app.inert = true
      inerted = app
    }
  }

  let done = false
  function finish() {
    if (done) return
    done = true
    clearTimeout(failsafe)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', layout)
    root.remove()
    if (inerted) inerted.inert = false
    html.style.overflow = prevOverflow
    if (meta && appTheme !== null) meta.setAttribute('content', appTheme)
    window.dispatchEvent(new Event('zg:splash-done'))
  }
  // 保險：畫面出錯、或瀏覽器一直不跑 requestAnimationFrame，時間到了也一定收掉，不會把網頁蓋住
  const failsafe = setTimeout(finish, (MAX_WAIT + TOTAL[variant] + 2) * 1000)

  function frame(now: number) {
    if (done) return
    try {
      // 分頁切到背景回來時 dt 會很大：一次最多走 0.1 秒，不會一下子跳過整段
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      holdFocus()
      holdThemeColor()
      const isReady = ready()
      if (!isReady && t >= HOLD_AT[variant!]) spin += (dt * Math.PI * 2) / 2.4 // 等網頁時錶圈慢慢轉（和 Logo 的 spinning 同速）
      t = advance(variant!, t, dt, isReady)
      const s = frameState(variant!, t)
      if (s.iris > 0 && !opened) {
        // 開始展開：底色交給 canvas。點擊仍然擋到播完，避免連點兩下按到底下看不見的按鈕
        opened = true
        root.style.background = 'transparent'
      }
      if (t >= TOTAL[variant!]) {
        finish()
        return
      }
      draw(s)
      requestAnimationFrame(frame)
    } catch {
      finish()
    }
  }
  // 先同步畫第一格，第一次繪製就是深色開場，不會先閃一下白
  draw(frameState(variant, 0))
  requestAnimationFrame(frame)
}
