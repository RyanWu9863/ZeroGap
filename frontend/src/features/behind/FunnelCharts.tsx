import { useState } from 'react'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis } from 'recharts'
import type { FunnelStage } from '@/shared/lib/funnel'
import { cn } from '@/lib/utils'

const KEEP = 'var(--zg-chart-keep)'
const DROP = 'var(--zg-chart-drop)'
const tipBox = 'rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md'

type Row = { label: string; remaining: number; eliminated: number; tech: string }

/** 版本 1：橫向遞減長條（Q67）。單一數列不需要圖例；每條尾端直接標數字。 */
function Bars({ rows }: { rows: Row[] }) {
  return (
    <ResponsiveContainer width="100%" height={rows.length * 40 + 16}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 0 }}>
        <XAxis type="number" hide domain={[0, rows[0].remaining]} />
        <YAxis type="category" dataKey="label" width={116} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: 'var(--muted)' }}
          content={({ active, payload }) => {
            const r = payload?.[0]?.payload as Row | undefined
            if (!active || !r) return null
            return (
              <div className={tipBox}>
                <p className="font-medium">{r.label}</p>
                {r.tech && <p className="text-muted-foreground">濾網：{r.tech}</p>}
                <p className="zg-num">剩 {r.remaining.toLocaleString()} 組{r.eliminated ? `（−${r.eliminated.toLocaleString()}）` : ''}</p>
              </div>
            )
          }}
        />
        <Bar dataKey="remaining" barSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((r) => <Cell key={r.label} fill={KEEP} />)}
          <LabelList dataKey="remaining" position="right" formatter={(v) => Number(v).toLocaleString()} style={{ fill: 'var(--foreground)', fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

type SNode = { name: string; kind: 'keep' | 'drop'; value?: number }

/** 版本 2：桑基圖（Q67）。看得到組合在哪一關被「分流」出去；只標淘汰數和最後結果。 */
function Flow({ rows }: { rows: Row[] }) {
  const nodes: SNode[] = [{ name: `全部 ${rows[0].remaining.toLocaleString()}`, kind: 'keep' }]
  const links: { source: number; target: number; value: number }[] = []
  let from = 0
  rows.slice(1).forEach((r) => {
    nodes.push({ name: `${r.label} ${r.remaining.toLocaleString()}`, kind: 'keep' })
    const keepIdx = nodes.length - 1
    nodes.push({ name: `✗ ${r.label} −${r.eliminated.toLocaleString()}`, kind: 'drop' })
    links.push({ source: from, target: keepIdx, value: r.remaining }, { source: from, target: keepIdx + 1, value: r.eliminated })
    from = keepIdx
  })
  return (
    <ResponsiveContainer width="100%" height={360}>
      <Sankey
        data={{ nodes, links }}
        nodeWidth={10}
        nodePadding={22}
        margin={{ top: 22, right: 150, bottom: 8, left: 8 }}
        link={{ stroke: 'var(--zg-chart-drop)', strokeOpacity: 0.25 }}
        node={({ x, y, width, height, payload }) => {
          const p = payload as unknown as SNode
          const first = p === nodes[0] || p.name === nodes[0].name
          return (
            <g>
              <rect x={x} y={y} width={width} height={Math.max(height, 2)} rx={2} fill={p.kind === 'drop' ? DROP : KEEP} />
              {p.name && (
                // 起點的字放在節點上方，避免壓在流線上；其他放右邊
                <text
                  x={first ? x : x + width + 6}
                  y={first ? y - 6 : y + height / 2}
                  dy={first ? 0 : 4}
                  fontSize={11}
                  fill="var(--foreground)"
                >
                  {p.name}
                </text>
              )}
            </g>
          )
        }}
      >
        <Tooltip content={({ active, payload }) => (active && payload?.[0] ? <div className={tipBox}><span className="zg-num">{Number(payload[0].value).toLocaleString()} 組</span></div> : null)} />
      </Sankey>
    </ResponsiveContainer>
  )
}

/** 兩種漏斗都先做，讓組員挑（Q67）；下方永遠有表格版（無障礙、對比不足時的替代） */
export function FunnelCharts({ total, stages }: { total: number; stages: FunnelStage[] }) {
  const [view, setView] = useState<'bars' | 'flow'>('bars')
  const rows: Row[] = [{ label: '全部組合', tech: '', remaining: total, eliminated: 0 }, ...stages]
  return (
    <div>
      <div role="tablist" aria-label="漏斗圖樣式" className="mb-3 inline-flex rounded-md border p-0.5 text-xs">
        {(['bars', 'flow'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('rounded px-3 py-1', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
            {v === 'bars' ? '長條圖' : '桑基圖'}
          </button>
        ))}
      </div>
      {view === 'bars' ? (
        <Bars rows={rows} />
      ) : (
        // 桑基圖的文字在右側，手機上寬度不夠就讓它左右滑，不擠壓
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="min-w-[30rem]">
            <Flow rows={rows} />
          </div>
        </div>
      )}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">用表格看</summary>
        <table className="zg-num mt-2 w-full text-left">
          <thead className="text-muted-foreground">
            <tr><th className="py-1 font-normal">關卡</th><th className="font-normal">濾網</th><th className="text-right font-normal">剔除</th><th className="text-right font-normal">剩下</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t"><td className="py-1">{r.label}</td><td>{r.tech || '—'}</td><td className="text-right">{r.eliminated ? r.eliminated.toLocaleString() : '—'}</td><td className="text-right">{r.remaining.toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
