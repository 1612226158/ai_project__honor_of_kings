<script setup>
// 契约见 docs/contracts/组件契约.md §2.3：容器组件，不做过滤/不判态/不计数
import HeroCard from './HeroCard.vue'

defineProps({
  heroes: { type: Array, required: true }, // 已过滤的可见英雄
  poolState: { type: Object, required: true }, // { [id]: state }
  labels: { type: Object, required: true }, // { [id]: 徽标文字 }
  subLabels: { type: Object, default: () => ({}) }, // { [id]: 第二行文案 }，空则显示主职业
  locked: { type: Boolean, default: false }, // 整池锁定（我这局的 ban + pick 已用完）
  count: { type: Number, required: true },
  notice: { type: String, default: '' }, // 预选失效提示
  subhead: { type: String, default: '全部英雄' },
})

const emit = defineEmits(['select'])

// 首屏立即加载的卡片数：约两屏；其余 lazy，浏览器会在接近视口前预取
const EAGER_COUNT = 24
</script>

<template>
  <section class="pool-column" id="hero-pool" aria-labelledby="pool-title">
    <header class="pool-heading">
      <div>
        <span class="eyebrow">HERO POOL</span>
        <h2 id="pool-title">选择英雄</h2>
      </div>
      <span class="pool-total">共 <strong>{{ count }}</strong> 位英雄</span>
    </header>

    <!-- 筛选栏由父级通过默认插槽接入（原型里它就长在池列内） -->
    <slot />

    <div class="pool-subhead">
      <span>{{ subhead }}</span>
      <div class="pool-legend" aria-label="卡片状态说明">
        <span><i class="legend-dot available" aria-hidden="true"></i>可选择</span>
        <span><i class="legend-dot preselect" aria-hidden="true"></i>预选</span>
        <span><i class="legend-dot selected" aria-hidden="true"></i>已选择</span>
        <span><i class="legend-dot disabled" aria-hidden="true"></i>已禁用</span>
      </div>
    </div>

    <p v-if="notice" class="pool-notice" role="status">{{ notice }}</p>

    <div class="pool-scroll">
      <div v-if="heroes.length === 0" class="pool-empty">
        没有符合条件的英雄，请更换关键词或职业。
      </div>
      <div v-else class="pool-grid" role="group" aria-label="英雄列表">
        <HeroCard
          v-for="(h, index) in heroes"
          :key="h.id"
          :hero="h"
          :state="poolState[h.id] ?? ''"
          :label="labels[h.id] ?? ''"
          :sublabel="subLabels[h.id] ?? ''"
          :eager="index < EAGER_COUNT"
          :locked="locked"
          @choose="(id) => emit('select', id)"
        />
      </div>
    </div>
  </section>
</template>
