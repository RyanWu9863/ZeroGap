import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { RunError } from '@/api/planRuns'
import { benchmarkRequest } from '@/mocks/request'
import { NoSolution } from './NoSolution'

function render(error: Partial<RunError>) {
  const e: RunError = { code: 'NO_FEASIBLE', message: '', reasons: null, retryAfter: null, status: null, ...error }
  return renderToStaticMarkup(
    <MemoryRouter>
      <NoSolution request={benchmarkRequest} error={e} onRelax={() => {}} />
    </MemoryRouter>,
  )
}

describe('NoSolution', () => {
  it('出發點的交通接不上（transit_window）：顯示後端的 message、建議改從車站出發，不給放寬按鈕', () => {
    const html = render({
      message: '從出發點最早 17:05 才到得了商圈，最晚 17:29 就要離開，只有 24 分鐘',
      reasons: { transit_window: 15372 },
    })
    expect(html).toContain('從這個出發點，交通時間不夠')
    expect(html).toContain('最晚 17:29 就要離開')
    expect(html).toContain('改從車站出發')
    expect(html).not.toContain('一鍵重算')
  })
  it('其他原因照舊：列出被哪些條件擋下、給放寬按鈕', () => {
    const html = render({ reasons: { budget: 3 } })
    expect(html).toContain('找不到每段都接得上的行程')
    expect(html).toContain('一鍵重算')
  })
})
