<script setup>
// 阵容海报页（第 5 课 5.10）：只读 store.result 快照，不碰对局状态。
// 进入本页的唯一合法途径是选人页确认阵容——守卫会拦下没有快照的直访。
// 「重新征召」清快照回选人页；之后本页所有数据随之消失，符合"海报只反映确认那一刻"。
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDraftStore } from '../stores/draft.js'

const store = useDraftStore()
const router = useRouter()

// 快照只读；守卫保证进入本页时 result 必非 null
const { result } = storeToRefs(store)

const PRESET_TEXT = { standard: '标准征召', simple: '简单交替' }
const SIDE_TEXT = { blue: '蓝方', red: '红方' }

const ruleText = computed(() => {
  const s = store.result.settings
  return `${PRESET_TEXT[s.preset]} · ${SIDE_TEXT[s.firstSide]}先手`
})

// 确认时间：固定 Asia/Shanghai、补零的 YYYY-MM-DD  HH:mm（两个空格，对齐原型）。
// 按课程口径用 formatToParts 逐段拼接——toLocaleString 的输出格式随运行环境漂移。
const confirmedAtText = computed(() => {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(store.result.confirmedAt))
  const get = (t) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}  ${get('hour')}:${get('minute')}`
})

// 先手/后手标注跟随本局设置（快照里的 settings，而非当前 settings——用户改设置不影响旧海报）
const blueNote = computed(() =>
  `5 位英雄 · ${store.result.settings.firstSide === 'blue' ? '先手方' : '后手方'}`,
)
const redNote = computed(() =>
  `5 位英雄 · ${store.result.settings.firstSide === 'red' ? '先手方' : '后手方'}`,
)

function restartDraft() {
  store.resetDraft()
  router.push('/')
}
</script>

<template>
  <div class="poster-shell">
    <!-- 海报标题：对局信息与确认时间 -->
    <header class="poster-heading">
      <div>
        <span class="eyebrow">MATCH LINEUP</span>
        <h1>对阵阵容</h1>
        <p>双方英雄已就位，确认本局最终配置</p>
      </div>
      <div class="poster-meta">
        <span><small>征召规则</small><strong>{{ ruleText }}</strong></span>
        <span><small>确认时间</small><strong>{{ confirmedAtText }}</strong></span>
      </div>
    </header>

    <main class="poster-body">
      <!-- 上排：蓝方五位英雄大图 -->
      <section class="poster-team blue-side" aria-labelledby="poster-blue-title">
        <header class="poster-team-header">
          <div class="poster-team-name">
            <span class="poster-team-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m12 3 7 3v5c0 4.6-2.9 7.6-7 10-4.1-2.4-7-5.4-7-10V6l7-3Z" stroke="currentColor" stroke-width="1.7"/></svg></span>
            <div><h2 id="poster-blue-title">蓝方阵容</h2><span>BLUE TEAM</span></div>
          </div>
          <span class="poster-team-note">{{ blueNote }}</span>
        </header>
        <div class="poster-lineup">
          <figure v-for="(h, i) in result.bluePicks" :key="h.id" class="poster-hero">
            <img :src="h.images.cover" width="640" height="294" :alt="`${h.name}英雄大图`">
            <span class="poster-position">{{ String(i + 1).padStart(2, '0') }}</span>
            <figcaption>
              <div><strong class="name">{{ h.name }}</strong><span class="title">{{ h.title }}</span></div>
              <span class="role">{{ h.heroType.name }}</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <!-- 中央对阵标识 -->
      <div class="poster-vs-mid" aria-label="蓝方对阵红方">
        <span class="vs-line blue-line" aria-hidden="true"></span>
        <div class="vs-emblem"><strong>VS</strong><span>VERSUS</span></div>
        <span class="vs-line red-line" aria-hidden="true"></span>
      </div>

      <!-- 下排：红方五位英雄大图 -->
      <section class="poster-team red-side" aria-labelledby="poster-red-title">
        <header class="poster-team-header">
          <div class="poster-team-name">
            <span class="poster-team-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m12 3 7 3v5c0 4.6-2.9 7.6-7 10-4.1-2.4-7-5.4-7-10V6l7-3Z" stroke="currentColor" stroke-width="1.7"/></svg></span>
            <div><h2 id="poster-red-title">红方阵容</h2><span>RED TEAM</span></div>
          </div>
          <span class="poster-team-note">{{ redNote }}</span>
        </header>
        <div class="poster-lineup">
          <figure v-for="(h, i) in result.redPicks" :key="h.id" class="poster-hero">
            <img :src="h.images.cover" width="640" height="294" :alt="`${h.name}英雄大图`">
            <span class="poster-position">{{ String(i + 1).padStart(2, '0') }}</span>
            <figcaption>
              <div><strong class="name">{{ h.name }}</strong><span class="title">{{ h.title }}</span></div>
              <span class="role">{{ h.heroType.name }}</span>
            </figcaption>
          </figure>
        </div>
      </section>
    </main>

    <!-- 禁用名单：作为阵容海报的补充信息 -->
    <section class="poster-banned" aria-labelledby="poster-banned-title">
      <div class="label" id="poster-banned-title"><span>本局禁用</span><strong>{{ result.banned.length }}</strong></div>
      <div class="row">
        <span v-for="h in result.banned" :key="h.id" class="item">
          <img :src="h.images.avatar" width="30" height="30" alt="">{{ h.name }}
        </span>
      </div>
    </section>

    <footer class="poster-action">
      <span>阵容海报由本次征召结果生成</span>
      <button class="btn-confirm" type="button" @click="restartDraft">
        重新征召
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </footer>
  </div>
</template>
