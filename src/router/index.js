// 路由表（第 5 课 5.7–5.8）
import { createRouter, createWebHistory } from 'vue-router'
import { useDraftStore } from '../stores/draft.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'draft', component: () => import('../views/DraftPage.vue') },
    { path: '/poster', name: 'poster', component: () => import('../views/PosterPage.vue') },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsPage.vue') },
    // 兜底：未知地址一律回选人页
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// 海报守卫（5.8）：没有已确认的快照就不许进海报页。
// 前提：main.js 先装 pinia 再装 router，否则这里拿不到仓库。
router.beforeEach((to) => {
  if (to.name === 'poster') {
    const store = useDraftStore()
    if (store.result === null) return { name: 'draft' }
  }
  return true
})

export default router
