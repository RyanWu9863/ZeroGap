import { taipeiNow } from '@/shared/lib/time'
import { benchmarkRequest } from './request'

/*
 * 開發用假資料：下拉選單和狀態列（格式照後端規格書 6.2、6.3，2026-10-21 對過後端實際的回應）。
 * 有場次的日期用「今天起 14 天」動態產生，讓試做稿哪天打開都能選。
 */
export const counties = [
  { code: 'Taoyuan', name: '桃園市', has_open_areas: true },
  { code: 'Taipei', name: '臺北市', has_open_areas: false },
  { code: 'NewTaipei', name: '新北市', has_open_areas: false },
  { code: 'HsinchuCounty', name: '新竹縣', has_open_areas: false },
]

/** 跟後端一樣（v0.13）：青埔不開放（is_open: false），多了蘆竹（南崁） */
export const areas = [
  { code: 'taoyuan', name: '桃園區', is_open: true },
  { code: 'zhongli', name: '中壢', is_open: true },
  { code: 'qingpu', name: '青埔', is_open: false },
  { code: 'bade', name: '八德', is_open: true },
  { code: 'luzhu', name: '蘆竹（南崁）', is_open: true },
]

/** 站名的寫法跟後端一樣：台鐵、高鐵沒有「站」字，機捷有；台鐵和高鐵都有一個「桃園」 */
export const stations = [
  { id: 101, name: '桃園', operator: 'TRA' },
  { id: 102, name: '內壢', operator: 'TRA' },
  { id: 103, name: '中壢', operator: 'TRA' },
  { id: 104, name: '埔心', operator: 'TRA' },
  { id: 105, name: '楊梅', operator: 'TRA' },
  { id: 201, name: '桃園', operator: 'THSR' },
  { id: 301, name: '高鐵桃園站', operator: 'TYMC' },
]

export const categories = {
  cuisine: [
    { code: 'western', label: '西式' },
    { code: 'chinese', label: '中式' },
    { code: 'american', label: '美式' },
    { code: 'japanese', label: '日式' },
    { code: 'korean', label: '韓式' },
    { code: 'other', label: '其他' },
  ],
  movie_genre: [
    ['action', '動作'], ['adventure', '冒險'], ['comedy', '喜劇'], ['romance', '愛情'], ['drama', '劇情'], ['horror', '恐怖'], ['thriller', '驚悚懸疑'],
    ['scifi', '科幻'], ['fantasy', '奇幻'], ['animation', '動畫'], ['family', '家庭'], ['documentary', '紀錄片'], ['music', '音樂'], ['other', '其他'],
  ].map(([code, label]) => ({ code, label })),
}

export const MOVIES = [
  { id: 12, title: '劇場版 魔法少女小圓', genre: 'animation', runtime_min: 119 },
  { id: 15, title: '不存在的罪人', genre: 'drama', runtime_min: 105 },
]

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function availableDates(): string[] {
  const today = taipeiNow().date
  const [y, m, d] = today.split('-').map(Number)
  const out = Array.from({ length: 14 }, (_, i) => iso(new Date(y, m - 1, d + i))).filter((_, i) => i !== 3) // 故意空一天，展示「沒資料的日子灰掉」
  // 基準案例的日期還沒過就一定要有，情境卡和流程測試才排得出來
  if (benchmarkRequest.date >= today && !out.includes(benchmarkRequest.date)) out.push(benchmarkRequest.date)
  return out.sort()
}

export function coverage(area: string, date?: string | null) {
  const dates = availableDates()
  const has = Boolean(date && dates.includes(date))
  return {
    area,
    showtime_from: dates[0],
    showtime_to: dates.at(-1),
    available_dates: dates,
    ...(date
      ? {
          movies: has ? MOVIES : [],
          genres: has ? [{ code: 'animation', label: '動畫' }, { code: 'drama', label: '劇情' }] : [],
          hall_types: has ? [{ code: 'standard', label: '一般數位' }, { code: 'imax', label: 'IMAX' }] : [],
          languages: has ? ['中文', '日語'] : [],
        }
      : {}),
    restaurant_source: 'google',
  }
}

export function status() {
  const today = taipeiNow().date
  return {
    jev: { mode: 'mock', model: 'jev-mock' },
    llm: { connected: false, model: 'qwen2.5:3b' },
    data_updated_at: {
      atmovies: `${today}T06:03:00+08:00`,
      osm: `${today}T06:10:00+08:00`,
      google_places: `${today}T05:20:00+08:00`,
      tdx_stations: `${today}T04:02:00+08:00`,
    },
    restaurant_source: 'google',
  }
}
