/**
 * 告訴進場動畫「網頁已經畫出第一個畫面」：動畫播到錶盤後才會展開，不會露出半空的頁面。
 * 動畫在 index.html 裡（src/splash/splash.ts），兩邊只靠 window.__zgReady 溝通，不互相 import。
 */
export function markAppReady(): void {
  window.__zgReady = true
}
