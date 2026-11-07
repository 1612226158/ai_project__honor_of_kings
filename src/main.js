// 启动链路（第 5 课 5.12 更新）：
//   index.html  唯一挂载点 <div id="app">
//   main.js     先装 Pinia（仓库）、再装 Router（路由守卫要用仓库），最后挂 App
//   App.vue     外壳：页头 + <RouterView />；三个页面见 src/views/
import './style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useDraftStore } from './stores/draft.js'

const app = createApp(App)
app.use(createPinia()) // 先 pinia：路由守卫里 useDraftStore() 依赖已激活的 Pinia
app.use(router) // 再 router
app.mount('#app')

// 开发态把仓库暴露给自动化验收脚本（生产构建不含此分支）
if (import.meta.env.DEV) {
  window.__draftStore = useDraftStore()
}
