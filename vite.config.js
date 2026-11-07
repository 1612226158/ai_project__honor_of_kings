import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 与 Vue 版（5173）错开，方便第 7 课并排对拍
    port: 5174,
  },
  build: {
    // 与 Vue 版同一条铁律：构建前不清空 dist。默认行为会删掉 dist/heroes
    // （266 张素材，69 MB）再重新拷贝；改为只覆盖写入。需要彻底清理时手工处理。
    emptyOutDir: false,
  },
})
