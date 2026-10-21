// 用前端的 zod 驗證後端真正回傳的資料（只讀前端的 schemas.ts，不改前端）
// 執行：python tools/contract-check/collect.py 之後 node tools/contract-check/check.ts tools/contract-check/out
import { readFileSync } from "node:fs";
import * as S from "../../frontend/src/api/schemas.ts";

const dir = process.argv[2];
const cases: [string, any][] = [
  ["counties", S.CountiesResponse], ["areas", S.AreasResponse], ["stations", S.StationsResponse],
  ["categories_cuisine", S.CategoriesResponse], ["categories_genre", S.CategoriesResponse],
  ["coverage", S.CoverageResponse], ["coverage_date", S.CoverageResponse], ["status", S.StatusResponse],
  ["plan_result", S.PlanResult], ["plan_error", S.PlanErrorBody], ["error_body", S.PlanErrorBody],
  ["progress_filtering", S.ProgressEvent], ["progress_waiting", S.ProgressEvent], ["queued", S.QueuedEvent],
];
let failed = 0;
for (const [name, schema] of cases) {
  const data = JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
  const r = schema.safeParse(data);
  if (r.success) { console.log(`OK    ${name}`); continue; }
  failed++;
  const seen = new Set<string>();
  console.log(`FAIL  ${name}`);
  for (const issue of r.error.issues) {
    const path = issue.path.map((p: any) => (typeof p === "number" ? "#" : p)).join(".");
    const key = `${path}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`      ${path}: ${issue.message}`);
  }
}
console.log(failed ? `\n${failed} 個不相容` : "\n全部相容");
