import { z } from 'zod'

/*
 * API 合約（照後端規格書 v0.13 第 6 章；舊的 docs/API.md 已停用）。
 * 比喻：這是「驗貨單」。後端送來的資料先照這張單檢查，
 * 少欄位或型態不對就立刻報錯，不會讓畫面默默顯示錯的東西。
 * 欄位已經對過後端實際的回應（2026-10-21，後端 app/schemas）。
 */

const HHMM = z.string().regex(/^\d{2}:\d{2}$/)
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** ISO 8601，後端一律帶 +08:00 */
const ISO = z.string()

/** 清單端點直接回陣列（規格書 6.3）；早期推測可能包一層 {key: [...]}，兩種都收 */
function listOf<T extends z.ZodType>(item: T, key: string) {
  return z.union([z.array(item), z.object({ [key]: z.array(item) })]).transform((v) => (Array.isArray(v) ? v : (v[key] as z.infer<T>[])))
}

// ── 下拉選單（6.2） ─────────────────────────────────────────────

/** GET /api/counties：has_open_areas＝有開放約會的商圈 */
export const County = z.object({ code: z.string(), name: z.string(), has_open_areas: z.boolean().optional() })
export const CountiesResponse = listOf(County, 'counties')

/** GET /api/areas?county=：is_open 是 false 的商圈（例如青埔）不開放 */
export const Area = z.object({ code: z.string(), name: z.string(), is_open: z.boolean().optional() })
export const AreasResponse = listOf(Area, 'areas')

/** GET /api/stations?county=：operator 是 TRA 台鐵、THSR 高鐵、TYMC 桃園機捷；台鐵、高鐵的站名沒有「站」字 */
export const Station = z.object({ id: z.number().int(), name: z.string(), operator: z.string().nullish() })
export const StationsResponse = listOf(Station, 'stations')

/** GET /api/categories?kind=movie_genre|cuisine */
export const Category = z.object({ code: z.string(), label: z.string() })
export const CategoriesResponse = listOf(Category, 'categories')

const CodeLabel = z.object({ code: z.string(), label: z.string() })
/** 每家餐廳的來源；demo 是示意資料，不用標 Google 標誌或 OSM 出處（規格書 6.7） */
export const RestaurantSource = z.enum(['google', 'osm', 'demo'])
/** 這次規劃用哪個來源找餐廳：Google 規劃額度用完後變成 osm（規格書 6.3） */
export const SourceMode = z.enum(['google', 'osm'])

/** GET /api/coverage?area=&date=（6.3）。沒帶日期時，電影和片型等清單可能不給 */
export const CoverageResponse = z.object({
  area: z.string(),
  showtime_from: DATE.nullish(),
  showtime_to: DATE.nullish(),
  available_dates: z.array(DATE),
  movies: z.array(z.object({ id: z.number().int(), title: z.string(), genre: z.string().nullish(), runtime_min: z.number().int() })).default([]),
  genres: z.array(CodeLabel).default([]),
  hall_types: z.array(CodeLabel).default([]),
  languages: z.array(z.string()).default([]),
  restaurant_source: SourceMode.optional(),
})

/** GET /api/status（6.3） */
export const StatusResponse = z.object({
  jev: z.object({ mode: z.enum(['real', 'mock']), model: z.string().nullish() }),
  llm: z.object({ connected: z.boolean(), model: z.string().nullish() }),
  data_updated_at: z.record(z.string(), z.string().nullable()),
  restaurant_source: SourceMode,
})

// ── 規劃請求（6.4） ─────────────────────────────────────────────

/** 一律送代碼或 id；「不限」「幫我挑」都送 null */
export const PlanRequest = z.object({
  area: z.string().min(1),
  origin_station_id: z.number().int().positive(),
  date: DATE,
  earliest_departure: HHMM,
  /** 可以跨到隔天凌晨 02:00 前，例如 "01:30" */
  latest_home: HHMM,
  order: z.enum(['movie_first', 'meal_first']),
  movie_id: z.number().int().nullable(),
  movie_genre: z.string().nullable(),
  hall_type: z.string().nullable(),
  language: z.string().nullable(),
  cuisine: z.string().nullable(),
  budget_per_person: z.number().int().positive(),
  max_walk_minutes: z.number().int().positive(),
})

// ── 規劃結果（6.5） ─────────────────────────────────────────────

export const BufferGate = z.enum(['showtime', 'last_order', 'return_trip', 'latest_return'])

/** 這一步的地點。Google 來源的餐廳沒有座標，只有 place_id */
export const Place = z.object({
  kind: z.enum(['station', 'hub', 'cinema', 'restaurant']),
  id: z.number().int(),
  name: z.string(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  place_id: z.string().nullish(),
})

/** 回程的兩個時間：離預定那班車幾分鐘、最晚幾點前還有車（v0.9） */
export const ReturnWindow = z.object({
  planned_depart_at: ISO,
  minutes_to_planned: z.number().int(),
  latest_depart_at: ISO,
  minutes_to_latest: z.number().int(),
})

const StepCommon = {
  place: Place.nullish(),
  buffer_minutes: z.number().int().nullish(),
  buffer_gate: BufferGate.nullish(),
  return_window: ReturnWindow.nullish(),
}

export const TimelineStep = z.discriminatedUnion('type', [
  z.object({ type: z.literal('transit'), from: z.string(), to: z.string(), summary: z.string(), depart_at: ISO, arrive_at: ISO, fare_per_person: z.number().int(), ...StepCommon }),
  z.object({ type: z.literal('walk'), from: z.string(), to: z.string(), minutes: z.number().int(), arrive_at: ISO, note: z.string().nullish(), ...StepCommon }),
  z.object({ type: z.literal('movie'), starts_at: ISO, ends_at: ISO, ...StepCommon }),
  z.object({ type: z.literal('wait'), minutes: z.number().int(), note: z.string().nullish(), ...StepCommon }),
  z.object({ type: z.literal('meal'), starts_at: ISO, ends_at: ISO, duration: z.enum(['fast', 'normal', 'slow']), ...StepCommon }),
  z.object({ type: z.literal('home'), station: z.string(), arrive_at: ISO, ...StepCommon }),
])

const Decider = z.enum(['jev', 'llm'])
export const CostKey = z.enum(['ticket', 'meal', 'fare_go', 'fare_return'])

/**
 * 電影、餐廳的備選只有估計值（v0.9）。
 * 電影備選搭配的餐廳跟方案不同時，restaurant_* 三個欄位才有值（v0.11）；restaurant_name 也可能因為 Google 額度用完是 null
 */
export const MovieAlternative = z.object({
  movie_id: z.number().int(),
  title: z.string(),
  probability: z.number(),
  home_at: ISO,
  cost_per_person_total: z.number().int(),
  estimated: z.boolean(),
  restaurant_id: z.number().int().nullish(),
  restaurant_name: z.string().nullish(),
  restaurant_cuisine: z.string().nullish(),
})
/** name 可能是 null：Google Pro 額度用完時備選只顯示類別 */
export const RestaurantAlternative = z.object({ restaurant_id: z.number().int(), name: z.string().nullable(), cuisine: z.string().nullish(), probability: z.number(), home_at: ISO, cost_per_person_total: z.number().int(), estimated: z.boolean() })
/** 路線的備選是 TDX 查到的另外幾條，所以是精確值 */
export const RouteAlternative = z.object({ summary: z.string(), depart_at: ISO, arrive_at: ISO, fare_per_person: z.number().int(), probability: z.number() })

export const Plan = z.object({
  rank: z.number().int().min(1).max(3),
  highlight: z.object({ key: z.string(), label: z.string(), reason: z.string() }).nullable(),
  score: z.number(),
  probabilities: z.object({ movie: z.number().nullish(), restaurant: z.number().nullish() }),
  /** 每一項由 Jev 還是 LLM 決定；只用來顯示，換一部／換一家看的是 alternatives（規格書 6.7） */
  decided_by: z.object({ movie: Decider.optional(), restaurant: Decider.optional(), route_go: Decider.optional(), route_return: Decider.optional() }),
  depart_at: ISO,
  home_at: ISO,
  minutes_before_deadline: z.number().int(),
  min_buffer_minutes: z.number().int(),
  movie: z.object({
    id: z.number().int(),
    title: z.string(),
    genre: z.string().nullish(),
    genre_label: z.string().nullish(),
    runtime_min: z.number().int(),
    cinema: z.string(),
    chain: z.string().nullish(),
    hall_type: z.string().nullish(),
    hall_type_label: z.string().nullish(),
    language: z.string().nullish(),
  }),
  restaurant: z.object({
    id: z.number().int(),
    /** Google 的 Place Details Pro 額度用完時是 null，畫面改顯示料理類別（v0.10） */
    name: z.string().nullable(),
    cuisine: z.string().nullish(),
    cuisine_label: z.string().nullish(),
    address: z.string().nullish(),
    price_range: z.string().nullish(),
    last_order: HHMM.nullish(),
    source: RestaurantSource,
    place_id: z.string().nullish(),
    /** false：營業時間看不懂或補不到，要提示「營業時間未確認，請向店家確認」（v0.10） */
    hours_verified: z.boolean(),
  }),
  timeline: z.array(TimelineStep),
  cost_per_person: z.object({ ticket: z.number().int(), meal: z.number().int(), fare_go: z.number().int(), fare_return: z.number().int(), total: z.number().int() }),
  estimated: z.array(CostKey),
  /** 只會出現有值的 key（v0.12）：哪一項有備選，結果頁就讓使用者換那一項 */
  alternatives: z
    .object({
      movie: z.array(MovieAlternative).optional(),
      restaurant: z.array(RestaurantAlternative).optional(),
      route_go: z.array(RouteAlternative).optional(),
      route_return: z.array(RouteAlternative).optional(),
    })
    .nullish()
    .transform((v) => v ?? {}),
})

export const PlanResult = z.object({
  job_id: z.string(),
  restaurant_source: SourceMode,
  stats: z.object({ combinations: z.number().int(), feasible: z.number().int() }),
  plans: z.array(Plan),
})

// ── SSE 事件（6.4） ─────────────────────────────────────────────

export const Stage = z.enum(['loading_data', 'checking_feasibility', 'filtering', 'choosing', 'llm_fallback', 'verifying_hours', 'routing', 'waiting_quota', 'building_result'])
export const QueuedEvent = z.object({ job_id: z.string(), position: z.number().int() })
/** filtering 帶組合數；waiting_quota 帶 service（tdx、jev）和 wait_seconds；llm_fallback 帶 question（規格書 6.4） */
export const ProgressEvent = z.object({
  stage: Stage,
  combinations: z.number().int().nullish(),
  feasible: z.number().int().nullish(),
  service: z.string().nullish(),
  wait_seconds: z.number().nullish(),
  question: z.string().nullish(),
})
/** error 事件和 HTTP 錯誤共用；reasons 只有 NO_FEASIBLE 才有：各條件排除了幾組 */
export const PlanErrorBody = z.object({ code: z.string(), message: z.string().default(''), reasons: z.record(z.string(), z.number()).nullish() })

export type County = z.infer<typeof County>
export type Area = z.infer<typeof Area>
export type Station = z.infer<typeof Station>
export type Category = z.infer<typeof Category>
export type CoverageResponse = z.infer<typeof CoverageResponse>
export type StatusResponse = z.infer<typeof StatusResponse>
export type PlanRequest = z.infer<typeof PlanRequest>
export type BufferGate = z.infer<typeof BufferGate>
export type Place = z.infer<typeof Place>
export type ReturnWindow = z.infer<typeof ReturnWindow>
export type TimelineStep = z.infer<typeof TimelineStep>
export type CostKey = z.infer<typeof CostKey>
export type MovieAlternative = z.infer<typeof MovieAlternative>
export type RestaurantAlternative = z.infer<typeof RestaurantAlternative>
export type RouteAlternative = z.infer<typeof RouteAlternative>
export type Plan = z.infer<typeof Plan>
export type RestaurantSource = z.infer<typeof RestaurantSource>
export type PlanResult = z.infer<typeof PlanResult>
export type Stage = z.infer<typeof Stage>
export type QueuedEvent = z.infer<typeof QueuedEvent>
export type ProgressEvent = z.infer<typeof ProgressEvent>
export type PlanErrorBody = z.infer<typeof PlanErrorBody>
