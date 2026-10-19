import { Clapperboard, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { PICK_FOR_ME } from '@/api/schemas'
import { useOptions } from '@/api/queries'
import { formatDate } from '@/shared/lib/format'
import { usePlanStore } from '@/store/planStore'
import { ChoiceCard, Chips, Disclosure, Field } from '../parts/Choice'
import { StepShell } from './StepShell'

/** ③ 娛樂（Q31、Q50、Q51、Q93、Q94）：介面叫「娛樂」，MVP 只有電影 */
export function StepFun() {
  const { request, setRequest } = usePlanStore()
  const base = useOptions()
  const districtId = base.data?.districts.find((d) => d.name === request.district_hub)?.id
  const { data } = useOptions(request.date || undefined, districtId)
  const movies = data?.movies ?? []
  const picked = request.movie_title !== PICK_FOR_ME

  // 換了日期或商圈，原本指定的片不在清單裡 → 改回「幫我挑」
  useEffect(() => {
    if (data && picked && !data.movies.some((m) => m.title === request.movie_title)) setRequest({ movie_title: PICK_FOR_ME })
  }, [data, picked, request.movie_title, setRequest])

  const nextDate = data?.available_dates?.find((d) => d !== request.date)

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
                <p>{request.date ? formatDate(request.date) : '這天'}{request.district_hub}還沒有場次資料。</p>
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
                  onClick={() => setRequest({ movie_title: PICK_FOR_ME })}
                  icon={<Sparkles className="size-4" />}
                  title="幫我挑最接得上的"
                  desc="從當天所有場次裡，挑時間最順的那幾部"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {movies.map((m) => (
                    <ChoiceCard
                      key={m.id}
                      selected={request.movie_title === m.title}
                      onClick={() => setRequest({ movie_title: m.title, movie_genre: '不限' })}
                      icon={<Clapperboard className="size-4" />}
                      title={m.title}
                      desc={`片長 ${m.runtime_minutes} 分鐘`}
                    />
                  ))}
                </div>
              </div>
            )}
          </Field>
          <Disclosure title={picked ? '更多偏好（影廳・語言）' : '更多偏好（片型・影廳・語言）'}>
            {!picked && (
              <Field title="片型">
                <Chips label="片型" value={request.movie_genre} onChange={(movie_genre) => setRequest({ movie_genre })} options={data.movie_genres.map((v) => ({ value: v, label: v }))} />
              </Field>
            )}
            <Field title="影廳">
              <Chips label="影廳" value={request.theater_type} onChange={(theater_type) => setRequest({ theater_type })} options={data.theater_types.map((v) => ({ value: v, label: v }))} />
            </Field>
            <Field title="語言">
              <Chips label="語言" value={request.language} onChange={(language) => setRequest({ language })} options={data.languages.map((v) => ({ value: v, label: v }))} />
            </Field>
          </Disclosure>
        </>
      )}
    </StepShell>
  )
}
