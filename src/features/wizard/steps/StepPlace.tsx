import { MapPin } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { atStation } from '@/shared/lib/origin'
import { useAreas, useOpenCounty, useStations } from '@/api/queries'
import { usePlanStore } from '@/store/planStore'
import { ChoiceCard, Chips, Field } from '../parts/Choice'
import { LocationButton } from '../parts/LocationButton'
import { StationPicker } from '../parts/StationPicker'
import { StepShell } from './StepShell'

/**
 * ① 地點（Q17b、Q45、Q46）：縣市鎖住、商圈大卡片、出發站可搜尋。
 * 資料來自 /api/counties、/api/areas、/api/stations（規格書 6.2）。
 * 商圈卡片原本的「N 間影城・約 N 家餐廳」後端這一版不提供（提案 #8），先拿掉。
 */
export function StepPlace() {
  const { request, setRequest } = usePlanStore()
  const { counties, county } = useOpenCounty()
  const areas = useAreas().data
  const stations = useStations().data
  // 送出前重新定位失敗時，精靈會帶著原因回到這一步
  const locateError = (useLocation().state as { locateError?: string } | null)?.locateError ?? null

  // 存著的商圈或車站在清單裡找不到（例如換了後端）→ 清掉，請使用者重選
  useEffect(() => {
    if (areas && request.area && !areas.some((a) => a.code === request.area)) setRequest({ area: '' })
  }, [areas, request.area, setRequest])
  useEffect(() => {
    if (stations && request.origin_station_id && !stations.some((s) => s.id === request.origin_station_id)) setRequest({ origin_station_id: 0 })
  }, [stations, request.origin_station_id, setRequest])

  const open = counties?.filter((c) => c.code === county) ?? []
  return (
    <StepShell title="從哪裡出發，去哪裡玩？" loading={!counties || !areas || !stations}>
      {areas && stations && (
        <>
          <Field title="縣市" hint="目前服務桃園市，其他縣市陸續開放。">
            <Chips
              label="縣市"
              value={county ?? ''}
              onChange={() => {}}
              options={[...open.map((c) => ({ value: c.code, label: c.name })), { value: '_more', label: '其他縣市・即將開放', disabled: true }]}
            />
          </Field>
          <Field title="想去哪個商圈？">
            <div role="radiogroup" aria-label="商圈" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {areas.map((a) => (
                <ChoiceCard key={a.code} selected={request.area === a.code} onClick={() => setRequest({ area: a.code })} icon={<MapPin className="size-4" />} title={a.name} />
              ))}
            </div>
          </Field>
          <Field title="從哪裡出發？" hint="行程會算到「回到出發的地方」為止。">
            <div className="space-y-3">
              <LocationButton request={request} onChange={setRequest} error={locateError} />
              <StationPicker stations={stations} value={request.origin_station_id ?? 0} onChange={(id) => setRequest(atStation(id))} />
            </div>
          </Field>
        </>
      )}
    </StepShell>
  )
}
