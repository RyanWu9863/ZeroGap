import { ArrowRight, CalendarClock, ChevronDown } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { failure, useAreas, useCounties, useCoverage, useStations } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { SCENARIOS } from '@/features/intro/scenarios'
import { Chips } from '@/features/wizard/parts/Choice'
import { useDateAutoFix } from '@/features/wizard/useDateAutoFix'
import { useDateContext } from '@/features/wizard/useDateContext'
import { BUDGET_OPTIONS } from '@/shared/lib/config'
import { formatDate, formatMoney, stationDisplay } from '@/shared/lib/format'
import { atStation, LOCATION_NAME, usesLocation } from '@/shared/lib/origin'
import { LoadError } from '@/shared/ui/LoadError'
import { usePlanStore } from '@/store/planStore'
import { triggerClass } from './pickerTrigger'
import { dateIssue, quickMissing, type QuickField } from './quickPlan'

// 小視窗（Base UI Popover＋車站清單＋月曆）延遲載入，不拖慢首頁 LCP；載入前先畫一樣的按鈕
const StationPopover = lazy(() => import('./QuickPickers').then((m) => ({ default: m.StationPopover })))
const DatePopover = lazy(() => import('./QuickPickers').then((m) => ({ default: m.DatePopover })))

function TriggerFace({ label }: { label: ReactNode }) {
  return (
    <button type="button" className={triggerClass} aria-disabled="true">
      <span className="truncate">{label}</span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

/** 一格：fieldset＋legend；缺的時候下方紅字，用 aria-describedby 連起來 */
function Cell({ field, title, error, children }: { field: QuickField; title: string; error: string | null; children: ReactNode }) {
  const errorId = `quick-${field}-error`
  return (
    <fieldset id={`quick-${field}`} className="min-w-0 space-y-2" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 text-sm font-medium">{title}</legend>
      {children}
      {error && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}

/**
 * 首頁四格快速條件（規格 3.2）：商圈、出發、日期、預算，填好按「排行程」直接到結果頁。
 * 其他條件（時間、片型、料理…）沿用目前的值，想改按「更多條件」進四步精靈。
 * 檔名不叫 QuickPlan.tsx：Mac、Windows 的檔名不分大小寫，會跟同一層的 quickPlan.ts 搶同一個匯入路徑。
 */
export function QuickPlan() {
  const navigate = useNavigate()
  const request = usePlanStore((s) => s.request)
  const setRequest = usePlanStore((s) => s.setRequest)
  const countiesQuery = useCounties()
  const areasQuery = useAreas()
  const stationsQuery = useStations()
  const coverageQuery = useCoverage(request.area || undefined)
  const areas = areasQuery.data
  const stations = stationsQuery.data
  const queries = [countiesQuery, areasQuery, stationsQuery, coverageQuery]
  const failed = queries.map(failure).find(Boolean) ?? null

  const ctx = useDateContext()
  // 日期不能用、或今天的出發時間已過 → 換成最近可以排的日子並說明（跟精靈第 2 步同一條規則）
  const { notice, pending, pickDate } = useDateAutoFix(ctx)

  const [tried, setTried] = useState(false)

  const known = { areas: areas?.map((a) => a.code), stations: stations?.map((s) => s.id) }
  const missing = quickMissing(request, known, ctx)
  const errorOf = (f: QuickField): string | null => {
    if (!tried || !missing.includes(f)) return null
    if (f === 'area') return '請選要去的商圈'
    if (f === 'origin') return '請選出發的車站'
    if (f === 'budget') return '請選預算'
    return dateIssue(request, ctx) === 'past-departure' ? `今天 ${request.earliest_departure} 已經過了，請改選別天` : '請選日期'
  }

  // 清單或場次日期還在載入、日期還沒自動換好時先按了「排行程」：記著，載入好再送，不吃掉這次點擊
  const settling = !areas || !stations || (Boolean(request.area) && !ctx.available) || pending
  const queued = useRef(false)

  const submit = () => {
    if (settling) {
      queued.current = true
      return
    }
    if (missing.length) {
      setTried(true)
      document.getElementById(`quick-${missing[0]}`)?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
      return
    }
    // 用目前位置出發：交給精靈最後一步，送出時重新定位（首頁不處理定位）
    if (usesLocation(request)) return navigate('/plan/4')
    navigate('/result', { state: { replay: true } })
  }

  useEffect(() => {
    if (!queued.current || settling) return
    queued.current = false
    submit()
  })

  const station = stations?.find((s) => s.id === request.origin_station_id)
  const stationLabel = !stations ? '載入車站中…' : usesLocation(request) ? LOCATION_NAME : station ? stationDisplay(station) : '選車站'
  const dateLabel = request.date ? formatDate(request.date) : '選日期'

  return (
    <section aria-labelledby="quick-title" className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
      <h2 id="quick-title" className="text-sm font-medium text-muted-foreground">
        排一個晚上
      </h2>
      <div className="zg-surface mt-3 p-4 sm:p-6">
        {failed ? (
          <LoadError error={failed} onRetry={() => queries.filter((q) => q.isError).forEach((q) => void q.refetch())} compact />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cell field="area" title="去哪個商圈" error={errorOf('area')}>
                {areas ? (
                  <Chips label="商圈" value={request.area} onChange={(area) => setRequest({ area })} options={areas.map((a) => ({ value: a.code, label: a.name }))} />
                ) : (
                  // 載入中先佔好跟商圈按鈕差不多的位置，載入後下面的版面不跳
                  <div className="flex flex-wrap gap-2" role="status" aria-label="載入商圈中">
                    {[4, 3, 3, 6].map((w, i) => (
                      <span key={i} className="h-[34px] rounded-full bg-muted pointer-coarse:h-10" style={{ width: `${w + 2}em` }} />
                    ))}
                  </div>
                )}
              </Cell>

              <Cell field="origin" title="從哪出發" error={errorOf('origin')}>
                <Suspense fallback={<TriggerFace label={stationLabel} />}>
                  <StationPopover label={stationLabel} stations={stations} value={request.origin_station_id ?? 0} onChange={(id) => setRequest(atStation(id))} />
                </Suspense>
              </Cell>

              <Cell field="date" title="哪天" error={errorOf('date')}>
                <Suspense fallback={<TriggerFace label={dateLabel} />}>
                  <DatePopover
                    label={dateLabel}
                    hint={request.area ? undefined : '先選商圈，才知道哪幾天有場次。'}
                    available={ctx.available ? [...ctx.available] : []}
                    value={request.date}
                    today={ctx.today}
                    onChange={pickDate}
                  />
                </Suspense>
                {notice && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground" role="status">
                    <CalendarClock className="mt-px size-3.5 shrink-0 text-zg-tight" aria-hidden="true" />
                    <span>{notice}</span>
                  </p>
                )}
              </Cell>

              <Cell field="budget" title="每人預算" error={errorOf('budget')}>
                <Chips
                  label="每人預算"
                  value={request.budget_per_person}
                  onChange={(budget_per_person) => setRequest({ budget_per_person })}
                  options={BUDGET_OPTIONS.map((v) => ({ value: v, label: formatMoney(v) }))}
                />
              </Cell>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button size="lg" className="h-12 gap-2 rounded-full px-7 text-base" onClick={submit}>
                排行程 <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <Link to="/plan/1" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                更多條件（時間、片型、料理…）
              </Link>
            </div>
          </>
        )}
      </div>

      <div className="mt-5">
        <p className="text-sm text-muted-foreground">常見情境</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SCENARIOS.map((s) => {
            const on = Object.entries(s.patch).every(([k, v]) => request[k as keyof typeof request] === v)
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setRequest(s.patch)}
                className="rounded-full border bg-card px-3.5 py-1.5 text-left text-sm transition-colors pointer-coarse:min-h-10 hover:border-foreground/40 aria-pressed:border-primary aria-pressed:bg-primary/10"
              >
                <span className="font-medium">{s.title}</span>
                <span className="zg-num ml-2 text-xs text-muted-foreground">{s.detail}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
