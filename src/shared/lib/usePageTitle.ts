import { useEffect } from 'react'

/** index.html 裡的完整標題，介紹頁用它 */
const DEFAULT_TITLE = typeof document === 'undefined' ? '' : document.title

/**
 * 瀏覽器分頁標題（計畫 P2-2）：「② 時間｜零空檔」。
 * 試用時開好幾個分頁也分得出是哪一頁；螢幕閱讀器換頁時也會唸出來。null＝用完整標題。
 */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title}｜零空檔` : DEFAULT_TITLE
  }, [title])
}
