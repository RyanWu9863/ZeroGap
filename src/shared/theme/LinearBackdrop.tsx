/*
 * C Linear 風的背景：頂端一抹靛紫光暈＋往下淡出的細格線。
 * 只是靜態 CSS 漸層，不動、不吃效能。
 */
export function LinearBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 bg-background" aria-hidden="true">
      <div
        className="absolute inset-x-0 top-0 h-[520px]"
        style={{ background: 'radial-gradient(60% 60% at 50% 0%, rgb(94 106 210 / 0.22), transparent 70%)' }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.035) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'linear-gradient(to bottom, black, transparent 60%)',
        }}
      />
    </div>
  )
}
