// GitHub Pages 版打包（決策 Q90）：網址多一層 /repo名稱/，另外複製一份 404.html 讓重新整理也能開。
// 用 Node 寫，Mac 和 Windows 都能跑（原本的 ${PAGES_BASE:-…} 和 cp 只有 Mac／Linux 認得）。
// 執行：npm run build:pages；預設網址多一層 /zerogap-frontend/（repo 名稱），要換就設環境變數 PAGES_BASE
import { execSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const base = process.env.PAGES_BASE || '/zerogap-frontend/'
const run = (cmd) => execSync(cmd, { stdio: 'inherit' })
run('npx tsc -b')
run(`npx vite build --base=${base}`)
const dist = (f) => fileURLToPath(new URL(`../dist/${f}`, import.meta.url))
copyFileSync(dist('index.html'), dist('404.html'))
console.log(`GitHub Pages 版打包完成（base=${base}）`)
