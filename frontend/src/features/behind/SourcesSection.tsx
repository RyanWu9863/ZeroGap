import { useStatus } from '@/api/queries'
import { USE_MOCK } from '@/api/client'
import { stamp } from '@/shared/lib/time'
import { useDemoStore } from '@/store/demoStore'

const NAMES: Record<string, string> = {
  atmovies: '開眼電影網（場次）',
  osm: 'OpenStreetMap（餐廳）',
  google_places: 'Google Places（餐廳）',
  tdx_stations: '交通部 TDX（車站）',
}

/** 系統幕後 ③：資料來源狀態（驗收 A9，/api/status）＋展示模式開關（Q69） */
export function SourcesSection() {
  const { data } = useStatus()
  const { demo, setDemo } = useDemoStore()
  return (
    <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
      <div className="zg-surface p-5">
        <h3 className="font-semibold">資料來源</h3>
        {data && (
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">推薦引擎</dt>
              <dd>Jev {data.jev.mode === 'real' ? '正式版' : '模擬版'}{data.jev.model && <span className="zg-num text-muted-foreground">・{data.jev.model}</span>}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">LLM 代選（本機 Ollama）</dt>
              <dd className={data.llm.connected ? undefined : 'text-zg-tight'}>
                {data.llm.connected ? '已連線' : '未連線'}{data.llm.model && <span className="zg-num text-muted-foreground">・{data.llm.model}</span>}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">這次用的餐廳來源</dt>
              <dd>{data.restaurant_source === 'google' ? 'Google Places' : 'OpenStreetMap（Google 額度用完）'}</dd>
            </div>
            {Object.entries(data.data_updated_at).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{NAMES[k] ?? k}</dt>
                <dd className={v ? 'zg-num' : 'text-muted-foreground'}>{v ? stamp(v) : '尚未匯入'}</dd>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">班次不預先匯入：每次規劃時向 TDX 即時查詢。</p>
          </dl>
        )}
      </div>
      <div className="zg-surface p-5">
        <h3 className="font-semibold">展示模式</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Demo 現場後端或網路出問題時打開：改用預先錄製的回應，畫面頂端會一直顯示「展示模式」標籤。
          {USE_MOCK && '（目前整個前端本來就在用開發用假資料。）'}
        </p>
        <label className="mt-4 flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
          打開展示模式
        </label>
      </div>
    </div>
  )
}
