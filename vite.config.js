import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // 不在构建前清空 dist：默认行为会删掉 dist/heroes（266 张素材，68 MB）再重新拷贝，
    // 重复删除既慢又容易被安全策略拦截。改为只覆盖写入，代价是旧 hash 的 assets 会
    // 累积在 dist/assets 下；index.html 始终指向最新的 hash 文件，不影响运行。
    // 需要彻底清理时手工删除 dist 即可。
    emptyOutDir: false,
  },
})
