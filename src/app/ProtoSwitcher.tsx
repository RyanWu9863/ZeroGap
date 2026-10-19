import { PROTO_NAME, useProtoStore, type Proto } from '@/shared/theme/proto'

/** 試做版切換鈕：只在投票期間存在，定案後整個檔案刪掉（決策 Q38）。 */
export function ProtoSwitcher() {
  const { proto, setProto } = useProtoStore()
  return (
    <div
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-4 z-50 flex items-center gap-1 rounded-full border bg-popover/90 p-1 text-xs shadow-lg backdrop-blur lg:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]"
      role="radiogroup"
      aria-label="試做版"
    >
      <span className="px-2 text-muted-foreground">試做版</span>
      {(Object.keys(PROTO_NAME) as Proto[]).map((p) => (
        <button
          key={p}
          role="radio"
          aria-checked={proto === p}
          onClick={() => setProto(p)}
          className="rounded-full px-3 py-1.5 transition-colors aria-checked:bg-primary aria-checked:text-primary-foreground"
        >
          {PROTO_NAME[p]}
        </button>
      ))}
    </div>
  )
}
