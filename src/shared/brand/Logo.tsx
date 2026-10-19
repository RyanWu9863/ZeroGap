/*
 * ZeroGap 標誌（決策 Q84）：依初步 logo 重描的 SVG。
 * 外圈是錶盤刻度（呼應「精準時刻」），中間 ZG 用線條字。顏色跟著 currentColor 走，兩版都能用。
 */
const TICKS = Array.from({ length: 60 }, (_, i) => i)

export function DialRing({ spinning = false }: { spinning?: boolean }) {
  return (
    <g className={spinning ? 'origin-center animate-[spin_2.4s_linear_infinite] motion-reduce:animate-none' : undefined}>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {TICKS.map((i) => (
        <line
          key={i}
          x1="50"
          y1={i % 15 === 0 ? 1.5 : 4}
          x2="50"
          y2={i % 5 === 0 ? 8.5 : 6.5}
          stroke="currentColor"
          strokeWidth={i % 15 === 0 ? 2 : 0.8}
          transform={`rotate(${i * 6} 50 50)`}
          opacity={i % 5 === 0 ? 1 : 0.5}
        />
      ))}
    </g>
  )
}

export function LogoMark({ size = 32, spinning = false }: { size?: number; spinning?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <DialRing spinning={spinning} />
      <path
        d="M27 34h22L30 66h20M70 40a14 14 0 1 0 2 16h-12"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="flex items-baseline gap-1.5">
        <span className="font-mono text-[15px] font-semibold tracking-[0.12em]">ZEROGAP</span>
        <span className="hidden text-sm text-muted-foreground sm:inline">零空檔</span>
      </span>
    </span>
  )
}
