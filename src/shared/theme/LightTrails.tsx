import { useReducedMotion } from 'motion/react'

/*
 * B 電影感的背景（決策 Q43）：程式畫的「光軌」，像夜裡的車軌在站點剛好接上。
 * 純 SVG＋CSS 動畫，沒有圖片、沒有版權問題；開啟「減少動態」時只畫靜態線條（Q88）。
 */
const RAILS = [
  { d: 'M-50 720 C 300 640, 520 520, 760 470 S 1200 300, 1500 160', color: '#f5b544', dur: 9 },
  { d: 'M-50 260 C 260 300, 520 420, 760 470 S 1180 640, 1500 700', color: '#5ee6a0', dur: 11 },
  { d: 'M200 950 C 320 760, 520 620, 760 470 S 980 120, 1040 -40', color: '#7cc4ff', dur: 13 },
  { d: 'M-50 520 C 400 560, 900 360, 1500 420', color: '#f5b544', dur: 15 },
]
const STATIONS = [
  [760, 470],
  [1040, 300],
  [380, 590],
]

export function LightTrails({ dim = false }: { dim?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <svg
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ opacity: dim ? 0.45 : 1 }}
    >
      <defs>
        <radialGradient id="zg-glow" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#1a2230" />
          <stop offset="100%" stopColor="#07090d" />
        </radialGradient>
        <filter id="zg-blur">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <rect width="1440" height="900" fill="url(#zg-glow)" />
      {RAILS.map((r, i) => (
        <g key={i}>
          <path d={r.d} fill="none" stroke={r.color} strokeOpacity="0.14" strokeWidth="1.2" />
          {!reduce && (
            <path d={r.d} fill="none" stroke={r.color} strokeWidth="2.5" strokeLinecap="round" filter="url(#zg-blur)" strokeDasharray="90 1900">
              <animate attributeName="stroke-dashoffset" from="1990" to="0" dur={`${r.dur}s`} repeatCount="indefinite" />
            </path>
          )}
        </g>
      ))}
      {STATIONS.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill="#edeff3" opacity="0.8" />
          {!reduce && (
            <circle cx={x} cy={y} r="4" fill="none" stroke="#5ee6a0" strokeWidth="1.5">
              <animate attributeName="r" values="4;22" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0" dur="3s" begin={`${i}s`} repeatCount="indefinite" />
            </circle>
          )}
        </g>
      ))}
    </svg>
  )
}
