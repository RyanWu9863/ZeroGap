/** 從各來源的更新時間挑出最新的一個；無法解析的時間略過，全都沒有就回 null */
export function latestUpdate(times: (string | null | undefined)[]): Date | null {
  const ms = times.filter((t): t is string => !!t).map((t) => Date.parse(t)).filter(Number.isFinite)
  return ms.length ? new Date(Math.max(...ms)) : null
}
