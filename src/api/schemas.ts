import { z } from 'zod'

/*
 * API 合約（照 docs/API.md）。
 * 比喻：這是「驗貨單」。後端送來的資料先照這張單檢查，
 * 少欄位或型態不對就立刻報錯，不會讓畫面默默顯示錯的東西。
 * 標「API 變更提案 #n」的欄位是前端提案新增的，後端還沒加之前都是選填。
 */

const HHMM = z.string().regex(/^\d{2}:\d{2}$/)

export const BufferGate = z.enum(['showtime', 'last_order', 'return_trip', 'latest_return'])
export const CostItemKey = z.enum(['movie_ticket', 'dining', 'transit_outbound', 'transit_inbound'])
export const StepType = z.enum(['交通', '步行', '電影', '晚餐', '到家'])

export const Place = z.object({
  name: z.string(),
  kind: z.enum(['station', 'theater', 'restaurant']),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

export const TimelineStep = z.object({
  time: HHMM,
  type: StepType,
  desc: z.string(),
  place: Place.nullish(), // 提案 #2
  cost_item: CostItemKey.nullish(), // 提案 #9
  buffer_minutes: z.number().int().nullish(), // 提案 #1
  buffer_gate: BufferGate.nullish(), // 提案 #1
})

const CostLine = z.object({ amount: z.number().int(), is_estimated: z.boolean() })

export const Proposal = z.object({
  rank: z.number().int().min(1).max(3),
  rank_label: z.string(),
  highlight: z // 提案 #3
    .object({ key: z.string(), label: z.string(), reason: z.string() })
    .nullish(),
  confidence_breakdown: z.object({
    movie_prob: z.number(),
    restaurant_prob: z.number(),
    combined: z.number(),
  }),
  summary: z.object({
    departure_time: HHMM,
    return_time: HHMM,
    early_return_buffer_minutes: z.number().int(),
    min_buffer_minutes: z.number().int(),
    total_cost_per_person: z.number().int(),
  }),
  cost_breakdown: z.record(CostItemKey, CostLine),
  timeline_steps: z.array(TimelineStep),
  refs: z.object({
    showtime_id: z.number().int(),
    restaurant_id: z.number().int(),
    outbound_trip_id: z.number().int(),
    inbound_trip_id: z.number().int(),
  }),
})

export const ItineraryRequest = z.object({
  target_city: z.string(),
  district_hub: z.string(),
  origin_city: z.string(),
  origin_station: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  earliest_departure: HHMM,
  latest_return: HHMM,
  dining_order: z.enum(['看完電影再吃', '先吃再看']),
  movie_title: z.string(),
  movie_genre: z.string(),
  theater_type: z.string(),
  language: z.string(),
  cuisine_type: z.string(),
  dietary_restriction: z.string(),
  budget_per_person: z.number().int().positive(),
  max_walk_minutes: z.number().int().positive(),
  restaurant_name: z.string().optional(), // 提案 #6：低信心時使用者指定的餐廳
})

export const ItineraryResponse = z.object({
  result_status: z.enum(['ok', 'no_solution']),
  system_status: z.object({
    jev_mode: z.string(),
    llm_status: z.string(),
    data_freshness: z.record(z.string(), z.string()),
  }),
  funnel_stats: z.object({
    total_checked: z.number().int(),
    feasible_count: z.number().int(),
    returned_count: z.number().int(),
    by_filter: z // 提案 #7
      .array(z.object({ id: z.number().int(), name: z.string(), eliminated: z.number().int() }))
      .optional(),
  }),
  confidence_gate: z.object({
    threshold: z.number(),
    passed: z.boolean(),
    uncertain_field: z.enum(['movie', 'restaurant']).nullish(), // 提案 #6
    choices: z.array(z.object({ id: z.number().int(), label: z.string() })).optional(),
  }),
  top_3_proposals: z.array(Proposal),
  alternatives: z.array(Proposal),
  no_solution: z
    .object({
      blocking_filter: z.object({ id: z.number().int(), name: z.string() }),
      relax_suggestions: z.array(
        z.object({
          field: z.string(),
          current_value: z.number(),
          suggested_value: z.number(),
          feasible_count_after: z.number().int(),
        }),
      ),
    })
    .nullable(),
})

export const StatusResponse = z.object({
  jev_mode: z.string(),
  llm_status: z.string(),
  data_freshness: z.record(
    z.string(),
    z.object({ last_success_at: z.string().nullable(), last_status: z.enum(['ok', 'failed']) }),
  ),
})

export const OptionsResponse = z.object({
  cities: z.array(z.string()),
  districts: z.array(
    z.object({
      id: z.number().int(),
      city: z.string(),
      name: z.string(),
      theater_names: z.array(z.string()).optional(), // 提案 #8
      restaurant_count: z.number().int().optional(), // 提案 #8
    }),
  ),
  stations: z.array(z.object({ id: z.number().int(), name: z.string(), operator: z.string() })),
  dining_orders: z.array(z.string()),
  movies: z.array(z.object({ id: z.number().int(), title: z.string(), runtime_minutes: z.number().int() })),
  movie_genres: z.array(z.string()),
  theater_types: z.array(z.string()),
  languages: z.array(z.string()),
  cuisine_types: z.array(z.string()),
  dietary_restrictions: z.array(z.string()),
  budget_options: z.array(z.number().int()),
  walk_minutes_options: z.array(z.number().int()),
  available_dates: z.array(z.string()).optional(), // 提案 #4
})

/** API 規定「讓系統幫我挑電影」時 movie_title 要送這個固定字串；畫面上顯示成「幫我挑」 */
export const PICK_FOR_ME = '交給 Jev 決定'

export type OptionsResponse = z.infer<typeof OptionsResponse>
export type TimelineStep = z.infer<typeof TimelineStep>
export type Proposal = z.infer<typeof Proposal>
export type ItineraryRequest = z.infer<typeof ItineraryRequest>
export type ItineraryResponse = z.infer<typeof ItineraryResponse>
export type StatusResponse = z.infer<typeof StatusResponse>
export type BufferGate = z.infer<typeof BufferGate>
export type CostItemKey = z.infer<typeof CostItemKey>
