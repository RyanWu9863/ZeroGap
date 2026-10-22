import { useCategories } from '@/api/queries'
import { BUDGET_OPTIONS, WALK_OPTIONS } from '@/shared/lib/config'
import { formatMoney, walkDistance } from '@/shared/lib/format'
import { usePlanStore } from '@/store/planStore'
import { Chips, Field } from '../parts/Choice'
import { StepShell } from './StepShell'

/**
 * ④ 餐飲與預算（Q51、Q52）。料理類別來自 /api/categories?kind=cuisine，「不限」送 null。
 * 飲食限制這一版不做（2026-10-20 決定，設計留在後端規格書附錄 A）。
 */
export function StepFood() {
  const { request, setRequest } = usePlanStore()
  const { data } = useCategories('cuisine')
  return (
    <StepShell title="想吃什麼、預算多少？" loading={!data}>
      {data && (
        <>
          <Field title="想吃哪一類？">
            <Chips
              label="料理類型"
              value={request.cuisine}
              onChange={(cuisine) => setRequest({ cuisine })}
              options={[{ value: null, label: '不限' }, ...data.map((c) => ({ value: c.code, label: c.label }))]}
            />
          </Field>
          <Field title="每人預算" hint="含來回車資、電影票、一餐。">
            <Chips
              label="每人預算"
              value={request.budget_per_person}
              onChange={(budget_per_person) => setRequest({ budget_per_person })}
              options={BUDGET_OPTIONS.map((v) => ({ value: v, label: formatMoney(v) }))}
            />
          </Field>
          <Field title="影城到餐廳，最多走幾分鐘？" hint={`${request.max_walk_minutes} 分鐘 ≈ ${walkDistance(request.max_walk_minutes).replace('約 ', '')}`}>
            <Chips
              label="步行上限"
              value={request.max_walk_minutes}
              onChange={(max_walk_minutes) => setRequest({ max_walk_minutes })}
              options={WALK_OPTIONS.map((v) => ({ value: v, label: `${v} 分` }))}
            />
          </Field>
        </>
      )}
    </StepShell>
  )
}
