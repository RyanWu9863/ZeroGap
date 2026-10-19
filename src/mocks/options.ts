import type { OptionsResponse } from '@/api/schemas'

/*
 * 開發用假資料：GET /api/options（格式照 docs/API.md §5.2，加上提案 #4 #8）。
 * 有場次的日期用「今天起 14 天」動態產生，讓試做稿哪天打開都能選。
 * 影城名稱用「示意」字樣，避免被誤認成真實資料。
 */
function nextDays(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`)
  }
  return out
}

export function optionsMock(date?: string): OptionsResponse {
  const dates = nextDays(14).filter((_, i) => i !== 3) // 故意空一天，展示「沒資料的日子灰掉」
  return {
    cities: ['桃園市'],
    districts: [
      { id: 1, city: '桃園市', name: '桃園區', theater_names: ['桃園統領威秀', '示意影城 B'], restaurant_count: 42 },
      { id: 2, city: '桃園市', name: '中壢區', theater_names: ['示意影城 C'], restaurant_count: 35 },
      { id: 3, city: '桃園市', name: '青埔', theater_names: ['示意影城 D'], restaurant_count: 18 },
    ],
    stations: [
      { id: 1, name: '桃園站', operator: 'TRA' },
      { id: 2, name: '內壢站', operator: 'TRA' },
      { id: 3, name: '中壢站', operator: 'TRA' },
      { id: 4, name: '埔心站', operator: 'TRA' },
      { id: 5, name: '楊梅站', operator: 'TRA' },
      { id: 6, name: '高鐵桃園站', operator: 'TYMC' },
    ],
    dining_orders: ['看完電影再吃', '先吃再看'],
    movies: date && dates.includes(date)
      ? [
          { id: 12, title: '劇場版 魔法少女小圓', runtime_minutes: 119 },
          { id: 15, title: '不存在的罪人', runtime_minutes: 105 },
        ]
      : [],
    movie_genres: ['不限', '動畫', '劇情'],
    theater_types: ['不限', '一般', 'IMAX'],
    languages: ['不限', '中文', '英文', '日文'],
    cuisine_types: ['不限', '日式', '義式', '台式'],
    dietary_restrictions: ['沒有', '素食'],
    budget_options: [500, 800, 1000, 1500, 2000],
    walk_minutes_options: [5, 8, 10, 12, 15, 20],
    available_dates: dates,
  }
}
