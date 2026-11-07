/** 這個網站存在你瀏覽器裡的東西（關於頁的「隱私」段落用）。新增 localStorage 時一定要加在這裡，測試會檢查 */
export const STORAGE_KEYS: { key: string; what: string; keep: string }[] = [
  { key: 'zg-plan', what: '你上次填的條件（出發點、日期、預算等），下次打開不用重填', keep: '直到你清除瀏覽器資料' },
  { key: 'zg-plan-runs', what: '這台瀏覽器排過的行程結果，重新整理或回到分享頁時不用重排', keep: '最近 6 次的結果，直到你清除瀏覽器資料' },
  { key: 'zg-theme', what: '你選的外觀（日、夜、跟著手機）', keep: '直到你清除瀏覽器資料' },
  { key: 'zg-demo', what: '展示模式有沒有打開', keep: '直到你清除瀏覽器資料' },
  { key: 'zg-route-cache', what: '地圖查過的走路路線和餐廳位置，同一份行程不重複查', keep: '7 天' },
  { key: 'zg-mock-saved', what: '展示站（示範資料）排好的行程，讓分享頁在同一台瀏覽器打得開', keep: '7 天' },
]
