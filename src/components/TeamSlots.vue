<script setup>
// 契约见 docs/contracts/组件契约.md §2.4：纯展示，无事件
import { computed } from 'vue'

const props = defineProps({
  side: { type: String, required: true }, // 'blue' | 'red'
  heroes: { type: Array, required: true }, // 该方已选，按顺序，0–5 位
  activeNo: { type: Number, default: 0 }, // 需要高亮的槽位（1–5）；0 = 不亮
  statusText: { type: String, required: true },
  // 状态行是否灰显。语义上「不是本方在选择」而非「不轮到我」，故由父级判定；
  // 不传（null）时回落到 activeNo === 0，保持组件单独使用时的合理默认。
  dim: { type: Boolean, default: null },
})

const TEAM_NAME = { blue: '蓝方', red: '红方' }
const TEAM_EN = { blue: 'BLUE TEAM', red: 'RED TEAM' }

const slots = computed(() => Array.from({ length: 5 }, (_, i) => props.heroes[i] ?? null))
const isDim = computed(() => (props.dim == null ? props.activeNo === 0 : props.dim))
</script>

<template>
  <section class="team-slots" :class="side" :aria-labelledby="`${side}-team-title`">
    <header class="team-header">
      <div class="team-identity">
        <span class="team-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="m12 3 7 3v5c0 4.6-2.9 7.6-7 10-4.1-2.4-7-5.4-7-10V6l7-3Z" stroke="currentColor" stroke-width="1.7"/></svg>
        </span>
        <div><h2 :id="`${side}-team-title`">{{ TEAM_NAME[side] }}</h2><span>{{ TEAM_EN[side] }}</span></div>
      </div>
      <span class="team-count"><b>{{ heroes.length }}</b> / 5</span>
    </header>
    <div class="team-status" :class="{ waiting: isDim }">
      <span class="status-dot" aria-hidden="true"></span>{{ statusText }}
    </div>

    <ol class="slot-list">
      <li
        v-for="(h, i) in slots"
        :key="i"
        class="slot"
        :class="[h ? 'slot-filled' : 'slot-placeholder', !h && activeNo === i + 1 ? 'active' : '']"
      >
        <span class="slot-number">{{ String(i + 1).padStart(2, '0') }}</span>
        <template v-if="h">
          <img :src="h.images.avatar" width="52" height="52" alt="">
          <span class="slot-info">
            <strong>{{ h.name }}</strong><span>{{ h.title }}</span>
            <small>{{ h.heroType.name }} · {{ h.lanes[0] ?? '—' }}</small>
          </span>
        </template>
        <template v-else>
          <span class="placeholder-icon" :class="{ empty: activeNo !== i + 1 }" aria-hidden="true">
            <svg v-if="activeNo === i + 1" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </span>
          <span class="slot-info">
            <strong>{{ activeNo === i + 1 ? '等待选择' : '待选择' }}</strong>
            <span v-if="activeNo === i + 1">当前位置</span>
          </span>
        </template>
      </li>
    </ol>
  </section>
</template>
