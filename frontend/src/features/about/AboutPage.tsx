import { usePageTitle } from '@/shared/lib/usePageTitle'
import { STORAGE_KEYS } from './storageKeys'

const REPO = 'https://github.com/RyanWu9863/ZeroGap'
const linkClass = 'underline underline-offset-2 hover:text-foreground'

const SOURCES = [
  { what: '車站、公車和火車班次', from: '交通部 TDX 運輸資料流通服務', terms: '政府資料開放授權條款第 1 版；排行程時向交通部查班次，同一時段的結果最多暫存 6 小時。' },
  { what: '電影場次', from: '開眼電影網', terms: '僅供學術展示，場次以影城公告為準。' },
  { what: '餐廳（一部分）', from: 'OpenStreetMap', terms: <>© OpenStreetMap 貢獻者，<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className={linkClass}>ODbL 授權</a>。</> },
  { what: '餐廳（一部分）、地圖', from: 'Google 地圖、Google Places', terms: '依 Google 地圖服務條款使用，畫面上會標示來源；Google 地點的座標只短期暫存，不長期保存。' },
]

export function AboutPage() {
  usePageTitle('關於')
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">關於 ZeroGap</h1>
      <p className="mt-3 leading-relaxed text-muted-foreground">
        ZeroGap 零空檔幫你排好「看電影＋吃飯＋搭車」的一個晚上，保證每一段的時間都接得上：趕得上開演、趕得上點餐、趕得上回家的車。
      </p>

      <section className="mt-10" aria-labelledby="about-who">
        <h2 id="about-who" className="text-lg font-semibold">誰做的</h2>
        <p className="mt-2 leading-relaxed">資策會 AIAE1 第一組的專題作品。</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <a href={`${REPO}/graphs/contributors`} target="_blank" rel="noreferrer" className={linkClass}>成員和每個人的貢獻</a>
          </li>
          <li>
            <a href={REPO} target="_blank" rel="noreferrer" className={linkClass}>原始碼</a>
          </li>
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="about-data">
        <h2 id="about-data" className="text-lg font-semibold">資料來源和授權</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">資料</th>
                <th scope="col" className="px-3 py-2 font-medium">來源</th>
                <th scope="col" className="px-3 py-2 font-medium">授權或使用方式</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.what + s.from} className="border-t align-top">
                  <th scope="row" className="px-3 py-2 font-medium">{s.what}</th>
                  <td className="px-3 py-2">{s.from}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.terms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">時間和價格以現場為準；這是學術展示用的作品，不保證資料即時正確。</p>
      </section>

      <section className="mt-10" aria-labelledby="about-privacy">
        <h2 id="about-privacy" className="text-lg font-semibold">隱私</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 leading-relaxed">
          <li>不用註冊、沒有帳號，也沒有追蹤你的廣告或分析程式。</li>
          <li>分享連結：排好的行程會在伺服器上保存 7 天，知道連結的人都打得開。如果是從「目前位置」出發，連結裡的行程含有你出發的大概位置（約 100 公尺內）。</li>
        </ul>
        <p className="mt-4 leading-relaxed">這個網站在你的瀏覽器存了這些東西：</p>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          {STORAGE_KEYS.map((k) => (
            <li key={k.key} className="text-sm">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{k.key}</code>
              <span className="ml-2">{k.what}</span>
              <span className="ml-2 text-muted-foreground">（保留：{k.keep}）</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">清除這個網站的瀏覽器資料就會全部刪掉。</p>
      </section>

      <section className="mt-10" aria-labelledby="about-issues">
        <h2 id="about-issues" className="text-lg font-semibold">有問題或建議</h2>
        <p className="mt-2 leading-relaxed">
          到 GitHub{' '}
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer" className={linkClass}>開 issue</a>
          {' '}告訴我們。
        </p>
      </section>
    </div>
  )
}
