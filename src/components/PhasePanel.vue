<script setup>
// 契约见 docs/contracts/组件契约.md §2.5：纯展示 + reset 事件
import { computed } from 'vue'

const props = defineProps({
  eyebrow: { type: String, required: true },
  title: { type: String, required: true }, // 动作部分，如「禁用英雄」；方名由 side 决定
  sub: { type: String, required: true },
  side: { type: String, default: null }, // 'blue' | 'red' | null
  steps: { type: Array, required: true }, // [{ no, label, state }]
  banned: { type: Array, required: true },
  bannedCount: { type: Number, required: true },
  seconds: { type: Number, default: null }, // null → 显示 --（不限时 / 非我的回合）
  secondsTotal: { type: Number, default: null }, // 本步总秒数，仅用于进度条比例
  bannedNote: { type: String, default: '' }, // 空串不显示
})

const emit = defineEmits(['reset'])

const SIDE_NAME = { blue: '蓝方', red: '红方' }
const URGENT_SECONDS = 5 // 纯展示阈值：≤5 秒变红，不涉及业务判定

const sideName = computed(() => (props.side ? SIDE_NAME[props.side] : ''))
const secondsText = computed(() => (props.seconds == null ? '--' : props.seconds))
const urgent = computed(() => props.seconds != null && props.seconds <= URGENT_SECONDS)
const fillPercent = computed(() =>
  props.seconds == null || !props.secondsTotal ? 100 : Math.max(0, Math.min(100, (props.seconds / props.secondsTotal) * 100)),
)
const timerLabel = computed(() => (props.seconds == null ? '本步不限时' : `本轮剩余 ${props.seconds} 秒`))
</script>

<template>
  <section class="phase-panel" aria-labelledby="phase-title">
    <div class="phase-main">
      <div class="turn-block">
        <span class="turn-emblem" :class="side ?? 'blue'" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="m12 3 7 3v5c0 4.6-2.9 7.6-7 10-4.1-2.4-7-5.4-7-10V6l7-3Z" stroke="currentColor" stroke-width="1.7"/><path d="m9 12 2 2 4-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <div>
          <div class="eyebrow">{{ eyebrow }}</div>
          <h1 id="phase-title">
            <span :class="side === 'red' ? 'red-text' : 'blue-text'">{{ sideName }}</span>{{ title }}
          </h1>
          <p>{{ sub }}</p>
        </div>
      </div>

      <ol class="phase-steps" aria-label="征召流程">
        <li
          v-for="m in steps"
          :key="m.no"
          :class="m.state"
          :aria-current="m.state === 'current' ? 'step' : null"
        >
          <span class="step-index" aria-hidden="true">
            <svg v-if="m.state === 'complete'" viewBox="0 0 16 16" fill="none"><path d="m4 8 2.5 2.5L12 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <template v-else>{{ m.no }}</template>
          </span>
          <span>{{ m.label }}</span>
        </li>
      </ol>

      <div class="phase-actions">
        <div class="countdown" :class="{ urgent }" role="timer" :aria-label="timerLabel">
          <div class="countdown-copy">
            <span>本轮剩余</span>
            <strong>{{ secondsText }}<small>秒</small></strong>
          </div>
          <div class="countdown-track" aria-hidden="true"><div class="countdown-fill" :style="{ width: `${fillPercent}%` }"></div></div>
        </div>
        <button class="btn-reset" type="button" @click="emit('reset')">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.2 7A6.2 6.2 0 1 1 4 12.5M4.2 7V3.5M4.2 7h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          重置对局
        </button>
      </div>
    </div>

    <div class="banned-strip">
      <div class="banned-label">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/><path d="m5.2 5.2 9.6 9.6" stroke="currentColor" stroke-width="1.5"/></svg>
        <span>本局禁用</span>
        <strong>{{ bannedCount }}<span>/ 10</span></strong>
      </div>
      <ul class="banned-list" aria-label="已禁用英雄">
        <li v-for="h in banned" :key="h.id">
          <img :src="h.images.avatar" width="36" height="36" alt="" :title="h.name"><span class="sr-only">{{ h.name }}</span>
        </li>
      </ul>
      <span v-if="bannedNote" class="ban-note">{{ bannedNote }}</span>
    </div>
  </section>
</template>
