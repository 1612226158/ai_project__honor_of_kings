<script setup>
// 应用外壳（第 5 课 5.12）：页头 + RouterView；规则指示读仓库 settings，改先后手/预设后自动更新
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDraftStore } from './stores/draft.js'

const store = useDraftStore()
const { settings } = storeToRefs(store)
const route = useRoute()
const PRESET_TEXT = { standard: '标准征召', simple: '简单交替' }
const SIDE_TEXT = { blue: '蓝方', red: '红方' }

// 根类名随路由切换：选人页要「严格一屏」（.draft-page 的追加规则），海报/设置页自然滚动。
// 页面级追加规则用 .page-flow 覆盖回自然流式布局。
const pageClass = computed(() => {
  if (route.name === 'poster') return 'poster-page'
  return route.name === 'settings' ? 'draft-page page-flow' : 'draft-page'
})

// 海报路由下按原型口径显示「阵容已确认 | 标准征召」，其余路由显示「标准征召 | 蓝方先手」
const modeFirst = computed(() =>
  route.name === 'poster' ? '阵容已确认' : PRESET_TEXT[settings.value.preset],
)
const modeSecond = computed(() =>
  route.name === 'poster' ? PRESET_TEXT[settings.value.preset] : `${SIDE_TEXT[settings.value.firstSide]}先手`,
)
</script>

<template>
  <div :class="pageClass">
    <a v-if="route.name === 'draft'" class="skip-link" href="#hero-pool">跳到英雄池</a>

    <!-- 页头：产品标识、主导航与当前征召规则 -->
    <header class="site-header">
      <div class="header-inner">
        <RouterLink class="brand" to="/" aria-label="Heros BP 英雄征召工作台首页">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 3 27 7v8c0 7-4.6 11.4-11 14-6.4-2.6-11-7-11-14V7l11-4Z" stroke="currentColor" stroke-width="1.8"/>
              <path d="m11 11 10 10m0-10L11 21M9 9l4 1m10-1-4 1M9 23l4-1m10 1-4-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="brand-copy">
            <strong>HEROS <span>BP</span></strong>
            <small>英雄征召工作台</small>
          </span>
        </RouterLink>

        <nav class="site-nav" aria-label="主导航">
          <RouterLink to="/" exact-active-class="active">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
            英雄征召
          </RouterLink>
          <RouterLink to="/settings" exact-active-class="active">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
            对局设置
          </RouterLink>
        </nav>

        <div class="match-mode" :aria-label="`当前规则：${modeFirst}，${modeSecond}`">
          <span class="status-dot" aria-hidden="true"></span>
          <span>{{ modeFirst }}</span>
          <span class="mode-divider" aria-hidden="true"></span>
          <span>{{ modeSecond }}</span>
        </div></div>
    </header>

    <RouterView />
  </div>
</template>
