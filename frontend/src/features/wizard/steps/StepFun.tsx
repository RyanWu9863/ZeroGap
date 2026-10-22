import { Clapperboard, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { useAreas, useCoverage } from '@/api/queries'
import { formatDate } from '@/shared/lib/format'
import { usePlanStore } from '@/store/planStore'
import { ChoiceCard, Chips, Disclosure, Field } from '../parts/Choice'
import { StepShell } from './StepShell'

/**
 * ③ 娛樂（Q31、Q50、Q51、Q93、Q94）：介面叫「娛樂」，MVP 只有電影。
 * 電影、片型、影廳、語言都來自 /api/coverage?area=&date=，只列當天這個商圈有場次的（規格書 6.3）。
 * 「幫我挑」和「不限」都送 null。
 */
export function StepFun() {
  const { request, setRequest } = usePlanStore()
  const { data } = useCoverage(request.area || undefined, request.date || undefined)
  const areaName = useAreas().data?.find((a) => a.code === request.area)?.name ?? ''
  const movies = data?.movies ?? []
  const picked = request.movie_id != null

  // 換了日期或商圈，原本指定的片、片型、影廳、語言不在清單裡 → 改回「幫我挑」「不限」
  useEffect(() => {
    if (!data) return
    const patch: Parameters<typeof setRequest>[0] = {}
    if (request.movie_id != null && !data.movies.some((m) => m.id === request.movie_id)) patch.movie_id = null
    if (request.movie_genre != null && !data.genres.some((g) => g.code === request.movie_genre)) patch.movie_genre = null
    if (request.hall_type != null && !data.hall_types.some((h) => h.code === request.hall_type)) patch.hall_type = null
    if (request.language != null && !data.languages.includes(request.language)) patch.language = null
    if (Object.keys(patch).length) setRequest(patch)
  }, [data, request.movie_id, request.movie_genre, request.hall_type, request.language, setRequest])

  const nextDate = data?.available_dates.find((d) => d !== request.date)
  const any = { value: null, label: '不限' }

  return (
    <StepShell title="想看什麼？" loading={!data}>
      {data && (
        <>
          <Field title="娛樂類型" hint="展覽、KTV 等其他娛樂陸續加入。">
            <Chips
              label="娛樂類型"
              value="movie"
              onChange={() => {}}
              options={[
                { value: 'movie', label: '電影' },
                { value: 'expo', label: '展覽・即將開放', disabled: true },
                { value: 'ktv', label: 'KTV・即將開放', disabled: true },
              ]}
            />
          </Field>
          <Field title="想看哪一部？">
            {movies.length === 0 ? (
              <div className="zg-surface p-4 text-sm">
                <p>{request.date ? formatDate(request.date) : '這天'}{areaName}還沒有場次資料。</p>
                {nextDate && (
                  <button className="mt-3 rounded-md border px-3 py-1.5 hover:bg-muted" onClick={() => setRequest({ date: nextDate })}>
                    改成 {formatDate(nextDate)}
                  </button>
                )}
              </div>
            ) : (
              <div role="radiogroup" aria-label="電影" className="space-y-3">
                <ChoiceCard
                  selected={!picked}
                  onClick={() => setRequest({ movie_id: null })}
                  icon={<Sparkles className="size-4" />}
                  title="幫我挑最接得上的"
                  desc="從當天所有場次裡，挑時間最順的那幾部"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {movies.map((m) => (
                    <ChoiceCard
                      key={m.id}
                      selected={request.movie_id === m.id}
                      onClick={() => setRequest({ movie_id: m.id, movie_genre: null })}
                      icon={<Clapperboard className="size-4" />}
                      title={m.title}
                      desc={`片長 ${m.runtime_min} 分鐘`}
                    />
                  ))}
                </div>
              </div>
            )}
          </Field>
          <Disclosure title={picked ? '更多偏好（影廳・語言）' : '更多偏好（片型・影廳・語言）'}>
            {!picked && (
              <Field title="片型">
                <Chips label="片型" value={request.movie_genre} onChange={(movie_genre) => setRequest({ movie_genre })} options={[any, ...data.genres.map((g) => ({ value: g.code, label: g.label }))]} />
              </Field>
            )}
            <Field title="影廳">
              <Chips label="影廳" value={request.hall_type} onChange={(hall_type) => setRequest({ hall_type })} options={[any, ...data.hall_types.map((h) => ({ value: h.code, label: h.label }))]} />
            </Field>
            <Field title="語言">
              <Chips label="語言" value={request.language} onChange={(language) => setRequest({ language })} options={[any, ...data.languages.map((v) => ({ value: v, label: v }))]} />
            </Field>
          </Disclosure>
        </>
      )}
    </StepShell>
  )
}
