import { MapPin } from 'lucide-react'
import { useOptions } from '@/api/queries'
import { usePlanStore } from '@/store/planStore'
import { ChoiceCard, Chips, Field } from '../parts/Choice'
import { StationPicker } from '../parts/StationPicker'
import { StepShell } from './StepShell'

/** ① 地點（Q17b、Q45、Q46）：縣市鎖住、商圈大卡片、出發站可搜尋 */
export function StepPlace() {
  const { request, setRequest } = usePlanStore()
  const { data } = useOptions()
  return (
    <StepShell title="從哪裡出發，去哪裡玩？" loading={!data}>
      {data && (
        <>
          <Field title="縣市" hint="目前服務桃園市，其他縣市陸續開放。">
            <Chips
              label="縣市"
              value={request.target_city}
              onChange={() => {}}
              options={[...data.cities.map((c) => ({ value: c, label: c })), { value: '_more', label: '其他縣市・即將開放', disabled: true }]}
            />
          </Field>
          <Field title="想去哪個商圈？">
            <div role="radiogroup" aria-label="商圈" className="grid gap-3 sm:grid-cols-3">
              {data.districts.map((d) => (
                <ChoiceCard
                  key={d.id}
                  selected={request.district_hub === d.name}
                  onClick={() => setRequest({ district_hub: d.name })}
                  icon={<MapPin className="size-4" />}
                  title={d.name}
                  desc={
                    d.theater_names && d.restaurant_count != null
                      ? `${d.theater_names.length} 間影城・約 ${d.restaurant_count} 家餐廳`
                      : undefined
                  }
                />
              ))}
            </div>
          </Field>
          <Field title="從哪一站出發？" hint="行程會算到「回到這一站」為止。">
            <StationPicker stations={data.stations} value={request.origin_station} onChange={(name) => setRequest({ origin_station: name })} />
          </Field>
        </>
      )}
    </StepShell>
  )
}
