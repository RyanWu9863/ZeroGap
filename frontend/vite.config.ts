import { readFile } from 'node:fs/promises'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, minify, type Plugin, transformWithOxc } from 'vite'

// 連結預覽圖要絕對網址；沒設定時（本機開發）用相對路徑
process.env.VITE_SITE_URL ??= ''

const SPLASH = path.resolve(import.meta.dirname, 'src/splash/splash.ts')

/**
 * 進場動畫直接寫進 index.html（不等網頁程式下載）：
 * 把 src/splash/splash.ts 去掉型別、拿掉 export、包成立即執行的 script，正式版再壓縮。
 * splash.ts 不能 import 別的檔案，export 都要寫在行首。
 */
function inlineSplash(): Plugin {
  let base = '/'
  let build = false
  return {
    name: 'zg-inline-splash',
    configResolved(config) {
      base = config.base
      build = config.command === 'build'
    },
    async transformIndexHtml() {
      const source = await readFile(SPLASH, 'utf8')
      if (/^\s*import\s/m.test(source)) throw new Error('src/splash/splash.ts 不能 import 別的檔案：它會被直接寫進 index.html')
      const { code } = await transformWithOxc(source, SPLASH, { lang: 'ts' })
      const script = `(function(){${code.replace(/^export /gm, '')}\ntry{boot(${JSON.stringify(base)})}catch(e){var s=document.getElementById('zg-splash');if(s)s.remove();document.documentElement.style.overflow=''}})()`
      const out = build ? (await minify('splash.js', script)).code : script
      return [{ tag: 'script', children: out, injectTo: 'body-prepend' }]
    },
    // 開發時改了 splash.ts：整頁重新載入（它不在模組圖裡，不會自己熱更新）
    hotUpdate({ file }) {
      if (path.resolve(file) === SPLASH) this.environment.hot.send({ type: 'full-reload' })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), inlineSplash()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { proxy: { '/api': 'http://localhost:8000', '/mcp': 'http://localhost:8000' } },
})
