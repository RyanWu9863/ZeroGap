import { ArrowRight, CalendarClock, ChevronDown, RotateCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { errorText } from '@/api/errors'
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
import type { PickerHandoff } from './QuickPickers'
import { dateIssue, quickMissing, type QuickField } from './quickPlan'

/*
 * 小視窗（Base UI Popover＋車站清單＋月曆）延遲載入，不拖慢首頁 LCP（P2-4）。
 * 載入前先畫一樣的暫代按鈕；滑鼠移進卡片、焦點進卡片、按下去、或瀏覽器有空時才開始載入。
 * 暫代按鈕被按了就記著，載入好直接打開；焦點在暫代按鈕上，載入好就移到真的按鈕。
 * 不用 React.lazy：開始載入時不能換掉按鈕（按下去到放開之間按鈕被換掉，Safari 就收不到這次點擊），
 * 所以等程式真的載入好才一次換成真的按鈕。
 */
type Pickers = typeof import('./QuickPickers')
let pickersModule: Pickers | null = null
let pickersLoading: Promise<Pickers> | null = null
const loadPickers = () =>
  (pickersLoading ??= import('./QuickPickers').then((m) => (pickersModule = m)).catch((e) => {
    pickersLoading = null // 下次互動再試
    throw e
  }))
type PickerField = 'origin' | 'date'

function TriggerFace({ label, disabled, describedBy, onClick, onFocus, onBlur }: {
  label: ReactNode
  disabled?: boolean
  describedBy?: string
  onClick: () => void
  onFocus: () => void
  onBlur: () => void
}) {
  return (
    <button type="button" className={triggerClass} disabled={disabled} aria-describedby={describedBy} onClick={onClick} onFocus={onFocus} onBlur={onBlur}>
      <span className="truncate">{label}</span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

const errorId = (f: QuickField) => `quick-${f}-error`

/** 先按了「排行程」、清單還沒載入好：最多等幾毫秒，超過就說明並給「再試一次」 */
const SUBMIT_WAIT_MS = 10_000

/**
 * 商圈清單載入前的佔位：跟真的商圈按鈕同樣的外框和字級，裡面放同樣字數的全形空白，
 * 寬度、換行和真的一樣，載入後下面的「排行程」不會跳。
 * 佔位比真的寬時（2026-11-08 以前），iPad、手機上佔兩行、真的只有一行，「排行程」載入後往上跳 44～48px；
 * 按下去到放開之間剛好跳，放開的位置已經不在按鈕上，這次點擊就不見了。
 * 字數照目前開放的商圈：桃園區、中壢、八德、蘆竹（南崁）。商圈改了這裡跟著改（e2e「清單載入前後「排行程」不會移動」會抓到）。
 */
const AREA_NAME_LENGTHS = [3, 2, 2, 6]

/**
 * 一格：fieldset＋legend；缺的時候下方紅字，格子裡會拿到焦點的控制項用 aria-describedby 連到它。
 * 紅字本身不是 role=alert：按「排行程」時只用表單上方一個 alert 念第一個缺的格子，不會每格各念一次。
 */
function Cell({ field, title, error, children }: { field: QuickField; title: string; error: string | null; children: ReactNode }) {
  return (
    <fieldset id={`quick-${field}`} className="min-w-0 space-y-2">
      <legend className="mb-2 text-sm font-medium">{title}</legend>
      {children}
      {error && (
        <p id={errorId(field)} className="text-sm font-medium text-destructive">
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
  // 縣市這一格沒用到，但商圈、車站清單要先知道縣市才查得到（useOpenCounty，同一個請求不會多打）。
  // 縣市載入失敗時這兩份清單永遠不會開始查，所以要留著它的失敗狀態和重試，不然畫面會一直停在「載入中」
  const countiesQuery = useCounties()
  const areasQuery = useAreas()
  const stationsQuery = useStations()
  const areas = areasQuery.data
  const stations = stationsQuery.data
  // 只查清單裡真的有的商圈的場次：存著的商圈代碼過期了，就不去打一個一定失敗的請求，讓使用者在第一格重選
  const areaKnown = Boolean(areas?.some((a) => a.code === request.area))
  const coverageArea = areaKnown ? request.area : undefined
  const coverageQuery = useCoverage(coverageArea)
  const listQueries = [countiesQuery, areasQuery, stationsQuery]
  // 清單載入失敗：沒有清單哪一格都選不了，整張卡換成錯誤說明＋重試
  const failed = listQueries.map(failure).find(Boolean) ?? null
  // 場次日期載入失敗：只在「哪天」那一格說明＋重試，其他格照樣能改
  const coverageFailed = failure(coverageQuery)

  const ctx = useDateContext({ area: coverageArea })
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

  // 清單或場次日期還在載入、日期還沒自動換好時先按了「排行程」：記著（waiting），載入好再送，不吃掉這次點擊。
  // 等的時候按鈕顯示「準備中…」、再按不會多送；等超過 SUBMIT_WAIT_MS 就停下來說明（slow），讓使用者再試一次
  const settling = !areas || !stations || (areaKnown && !ctx.available && !coverageFailed) || pending
  const [waiting, setWaiting] = useState(false)
  const [slow, setSlow] = useState(false)

  const submit = () => {
    if (settling) {
      setSlow(false)
      setWaiting(true)
      return
    }
    if (waiting) setWaiting(false)
    if (slow) setSlow(false)
    // 不知道哪幾天有場次就不送：焦點移到「哪天」那格的重試
    if (coverageFailed) {
      document.getElementById('quick-date-retry')?.focus()
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

  // 載入失敗時丟掉先前記著的點擊：按「重試」後不要自己送出（在畫面渲染時改，不另外跑 effect）
  if (waiting && (failed || coverageFailed)) setWaiting(false)
  // 等的東西都好了：送出記著的點擊
  useEffect(() => {
    if (waiting && !settling) submit() // eslint-disable-line react/set-state-in-effect -- 送出（換頁）是這個 effect 要做的事，submit 順手收起「準備中」
  })
  useEffect(() => {
    if (!waiting) return
    const t = setTimeout(() => {
      setWaiting(false)
      setSlow(true)
    }, SUBMIT_WAIT_MS)
    return () => clearTimeout(t)
  }, [waiting])
  // 再試一次：卡住的請求重新查（還沒輪到查的不動），再記著這次點擊
  const retrySubmit = () => {
    for (const q of [countiesQuery, areasQuery, stationsQuery, coverageQuery]) if (q.isFetching) void q.refetch()
    submit()
  }

  const station = stations?.find((s) => s.id === request.origin_station_id)
  const stationLabel = !stations ? '載入車站中…' : usesLocation(request) ? LOCATION_NAME : station ? stationDisplay(station) : '選車站'
  const dateLabel = request.date ? formatDate(request.date) : '選日期'
  const describe = (f: QuickField) => (errorOf(f) ? errorId(f) : undefined)
  // 只念一次：第一個缺的格子＋還有幾格沒填（各格紅字不是 alert，見 Cell）
  const firstError = missing.length ? errorOf(missing[0]) : null
  const alertText = firstError ? (missing.length > 1 ? `${firstError}（還有 ${missing.length - 1} 格沒填）` : firstError) : ''

  // 小視窗程式：互動或瀏覽器有空時才載入；暫代按鈕被按、拿到焦點都記下來交給真的按鈕
  const [pickers, setPickers] = useState(pickersModule)
  const [requested, setRequested] = useState<PickerField | null>(null)
  const [faceFocus, setFaceFocus] = useState<PickerField | null>(null)
  const wakePickers = () => {
    if (!pickers) loadPickers().then(setPickers, () => {}) // 載入失敗就維持暫代按鈕，下次互動再載
  }
  useEffect(() => {
    if (pickersModule) return
    const go = () => void loadPickers().then(setPickers, () => {})
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(go, { timeout: 3000 })
      return () => cancelIdleCallback(id)
    }
    const t = setTimeout(go, 1500) // Safari 沒有 requestIdleCallback
    return () => clearTimeout(t)
  }, [])
  const handoff = (f: PickerField): PickerHandoff => ({
    open: requested === f,
    focus: faceFocus === f,
    describedBy: describe(f),
    taken: () => {
      setRequested((cur) => (cur === f ? null : cur))
      setFaceFocus((cur) => (cur === f ? null : cur))
    },
  })
  const face = (f: PickerField, label: string, disabled?: boolean) => (
    <TriggerFace
      label={label}
      disabled={disabled}
      describedBy={describe(f)}
      onClick={() => {
        setRequested(f)
        wakePickers()
      }}
      onFocus={() => {
        setFaceFocus(f)
        wakePickers()
      }}
      onBlur={() => setFaceFocus((cur) => (cur === f ? null : cur))}
    />
  )

  return (
    <section aria-labelledby="quick-title" className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
      <h2 id="quick-title" className="text-sm font-medium text-muted-foreground">
        排一個晚上
      </h2>
      <div className="zg-surface mt-3 p-4 sm:p-6" onPointerEnter={wakePickers} onPointerDownCapture={wakePickers} onFocusCapture={wakePickers}>
        {failed ? (
          <LoadError error={failed} onRetry={() => listQueries.filter((q) => q.isError).forEach((q) => void q.refetch())} compact />
        ) : (
          <>
            <p role="alert" className="sr-only">
              {alertText}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cell field="area" title="去哪個商圈" error={errorOf('area')}>
                {areas ? (
                  <Chips label="商圈" describedBy={describe('area')} invalid={Boolean(errorOf('area'))} value={request.area} onChange={(area) => setRequest({ area })} options={areas.map((a) => ({ value: a.code, label: a.name }))} />
                ) : (
                  // 載入中先佔好跟商圈按鈕一樣大的位置，載入後下面的版面不跳（見 AREA_NAME_LENGTHS）
                  <div className="flex flex-wrap gap-2" role="status" aria-label="載入商圈中">
                    {AREA_NAME_LENGTHS.map((n, i) => (
                      <span key={i} aria-hidden="true" className="zg-num rounded-full border border-transparent bg-muted px-3.5 py-1.5 text-sm whitespace-pre text-transparent select-none pointer-coarse:min-h-10">
                        {'\u3000'.repeat(n)}
                      </span>
                    ))}
                  </div>
                )}
              </Cell>

              <Cell field="origin" title="從哪出發" error={errorOf('origin')}>
                {pickers ? (
                  <pickers.StationPopover
                    label={stationLabel}
                    stations={stations}
                    value={request.origin_station_id ?? 0}
                    onChange={(id) => setRequest(atStation(id))}
                    handoff={handoff('origin')}
                  />
                ) : (
                  face('origin', stationLabel, !stations)
                )}
              </Cell>

              <Cell field="date" title="哪天" error={errorOf('date')}>
                {pickers ? (
                  <pickers.DatePopover
                    label={dateLabel}
                    hint={areaKnown ? undefined : '先選商圈，才知道哪幾天有場次。'}
                    available={ctx.available ? [...ctx.available] : []}
                    value={request.date}
                    today={ctx.today}
                    onChange={pickDate}
                    handoff={handoff('date')}
                  />
                ) : (
                  face('date', dateLabel)
                )}
                {coverageFailed != null && (
                  <div role="alert" className="space-y-1.5 text-sm">
                    <p className="font-medium text-destructive">{errorText(coverageFailed).title}</p>
                    <p className="text-xs text-muted-foreground">查不到哪幾天有場次，所以還不能排。</p>
                    <button
                      id="quick-date-retry"
                      type="button"
                      onClick={() => void coverageQuery.refetch()}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs hover:bg-muted pointer-coarse:h-10"
                    >
                      <RotateCw className="size-3.5" aria-hidden="true" /> 重試
                    </button>
                  </div>
                )}
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
                  describedBy={describe('budget')}
                  invalid={Boolean(errorOf('budget'))}
                  value={request.budget_per_person}
                  onChange={(budget_per_person) => setRequest({ budget_per_person })}
                  options={BUDGET_OPTIONS.map((v) => ({ value: v, label: formatMoney(v) }))}
                />
              </Cell>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button size="lg" className="h-12 gap-2 rounded-full px-7 text-base" aria-busy={waiting || undefined} onClick={waiting ? undefined : submit}>
                {waiting ? (
                  '準備中…'
                ) : (
                  <>
                    排行程 <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                )}
              </Button>
              <Link to="/plan/1" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                更多條件（時間、片型、料理…）
              </Link>
              {slow && settling && (
                <div role="alert" className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                  <p className="font-medium text-destructive">資料還沒載入好，所以還不能排。可能是網路比較慢。</p>
                  <button
                    type="button"
                    onClick={retrySubmit}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs hover:bg-muted pointer-coarse:h-10"
                  >
                    <RotateCw className="size-3.5" aria-hidden="true" /> 再試一次
                  </button>
                </div>
              )}
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
