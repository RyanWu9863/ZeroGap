import { useOptions } from '@/api/queries'
import { formatMoney, walkDistance } from '@/shared/lib/format'
import { usePlanStore } from '@/store/planStore'
import { Chips, Disclosure, Field } from '../parts/Choice'
import { StepShell } from './StepShell'

/** ④ 餐飲與預算（Q51、Q52） */
export function StepFood() {
  const { request, setRequest } = usePlanStore()
  const { data } = useOptions()
  return (
    <StepShell title="想吃什麼、預算多少？" loading={!data}>
      {data && (
        <>
          <Field title="想吃哪一類？">
            <Chips label="料理類型" value={request.cuisine_type} onChange={(cuisine_type) => setRequest({ cuisine_type })} options={data.cuisine_types.map((v) => ({ value: v, label: v }))} />
          </Field>
          <Field title="每人預算" hint="含來回車資、電影票、一餐。">
            <Chips
              label="每人預算"
              value={request.budget_per_person}
              onChange={(budget_per_person) => setRequest({ budget_per_person })}
              options={data.budget_options.map((v) => ({ value: v, label: formatMoney(v) }))}
            />
          </Field>
          <Field title="影城到餐廳，最多走幾分鐘？" hint={`${request.max_walk_minutes} 分鐘 ≈ ${walkDistance(request.max_walk_minutes).replace('約 ', '')}`}>
            <Chips
              label="步行上限"
              value={request.max_walk_minutes}
              onChange={(max_walk_minutes) => setRequest({ max_walk_minutes })}
              options={data.walk_minutes_options.map((v) => ({ value: v, label: `${v} 分` }))}
            />
          </Field>
          <Disclosure title="飲食限制">
            <Chips
              label="飲食限制"
              value={request.dietary_restriction}
              onChange={(dietary_restriction) => setRequest({ dietary_restriction })}
              options={data.dietary_restrictions.map((v) => ({ value: v, label: v }))}
            />
          </Disclosure>
        </>
      )}
    </StepShell>
  )
}
