import { Link } from 'react-router'

/** 還沒做的頁面（精靈、系統幕後）先放施工告示，照 Q90 時程補上。 */
export function Placeholder({ title, when }: { title: string; when: string }) {
  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-muted-foreground">這一頁預計在{when}完成。試做稿只包含介紹頁和結果頁。</p>
      <Link to="/result" className="mt-8 inline-block underline underline-offset-4">
        先看結果頁試做稿 →
      </Link>
    </section>
  )
}
