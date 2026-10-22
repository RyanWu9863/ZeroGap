import { useState } from 'react'
import { summarize, sessionTimes, toCsv } from './trialStats'
import { useTrialStore } from './trialStore'

/** 系統幕後：試用紀錄（Q79、Q80）。發表時的「Numbers tell」就從這裡來。 */
export function TrialRecords() {
  const { active, sessions, clear } = useTrialStore()
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!active && sessions.length === 0) return null
  const s = summarize(sessions)

  const download = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + toCsv(sessions)], { type: 'text/csv;charset=utf-8' }))
    const link = Object.assign(document.createElement('a'), { href: url, download: `zerogap-試用紀錄-${new Date().toISOString().slice(0, 10)}.csv` })
    link.click()
    URL.revokeObjectURL(url)
  }
  const copy = async () => {
    await navigator.clipboard.writeText(toCsv(sessions)).catch(() => undefined)
    setCopied(true)
  }

  return (
    <section>
      <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground">USER TRIAL</p>
      <h2 className="mb-2 mt-2 text-2xl font-bold cine:font-semibold lin:font-semibold">試用紀錄</h2>
      <p className="mb-6 text-sm text-muted-foreground">{active ? '試用模式開啟中（網址加 ?trial=0 關閉）。' : '試用模式已關閉。'}紀錄只存在這台電腦的瀏覽器。</p>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['完成試用', `${s.count} 人`],
          ['平均看懂用途', s.avgUnderstand != null ? `${s.avgUnderstand} 秒` : '—'],
          ['平均拿到行程', s.avgPlan != null ? `${s.avgPlan} 秒` : '—'],
          ['1 分鐘內完成', `${s.within60} / ${s.count}`],
          ['答對黃底＝估計值', `${s.yellowCorrect} / ${s.answered}`],
          ['平均願意採用', s.avgWilling != null ? `${s.avgWilling} / 5` : '—'],
          ['覺得比自己查快', `${s.faster} / ${s.answered}`],
        ].map(([label, value]) => (
          <div key={label} className="zg-surface p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="zg-num mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {sessions.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="zg-num w-full text-left text-xs">
            <thead className="text-muted-foreground"><tr><th className="py-1 font-normal">#</th><th className="font-normal">試做版</th><th className="font-normal">看懂</th><th className="font-normal">排行程</th><th className="font-normal">黃底</th><th className="font-normal">願意</th><th className="font-normal">比較快</th></tr></thead>
            <tbody>
              {sessions.map((x, i) => {
                const t = sessionTimes(x)
                return (
                  <tr key={x.id} className="border-t">
                    <td className="py-1">{i + 1}</td><td>{x.proto}</td><td>{t.understand ?? '—'} 秒</td><td>{t.plan ?? '—'} 秒</td>
                    <td>{x.answers?.yellow === 'estimate' ? '✓ 估計值' : (x.answers?.yellow ?? '—')}</td><td>{x.answers?.willing ?? '—'}</td><td>{x.answers ? (x.answers.faster ? '是' : '否') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <button disabled={!sessions.length} onClick={download} className="rounded-md border px-3 py-1.5 hover:bg-muted disabled:opacity-40">下載 CSV</button>
        <button disabled={!sessions.length} onClick={copy} className="rounded-md border px-3 py-1.5 hover:bg-muted disabled:opacity-40">{copied ? '已複製' : '複製 CSV'}</button>
        {confirming ? (
          <span className="flex items-center gap-2">
            確定刪除全部紀錄？
            <button className="font-medium text-zg-fail underline" onClick={() => { clear(); setConfirming(false) }}>刪除</button>
            <button className="text-muted-foreground underline" onClick={() => setConfirming(false)}>取消</button>
          </span>
        ) : (
          <button disabled={!sessions.length} onClick={() => setConfirming(true)} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40">清除紀錄</button>
        )}
      </div>
    </section>
  )
}
