<script setup>
// 契约见 docs/contracts/组件契约.md §2.1
// 只负责渲染一张卡，不判断禁选规则、不拼徽标文案、不碰业务状态。
defineProps({
  hero: { type: Object, required: true },
  state: { type: String, default: '' }, // '' | preselect | banned | picked-blue | picked-red
  label: { type: String, default: '' }, // 徽标文字，由父级给
  sublabel: { type: String, default: '' }, // 第二行文案；空则显示主职业（靠称号命中时父级传称号）
  eager: { type: Boolean, default: false }, // 首屏立即加载头像
  // 整池锁定：我这局的 ban + pick 都已用完，卡片一律不可点（含预选）
  locked: { type: Boolean, default: false },
})

defineEmits(['choose'])
</script>

<template>
  <button
    class="hero-card"
    :class="state"
    :disabled="locked || (state !== '' && state !== 'preselect')"
    type="button"
    :aria-label="`${label || '选择'}${hero.name}，${hero.heroType.name}`"
    @click="$emit('choose', hero.id)"
  >
    <span class="hero-portrait">
      <img
        :src="hero.images.avatar"
        width="100"
        height="100"
        alt=""
        :loading="eager ? 'eager' : 'lazy'"
        decoding="async"
      >
      <span v-if="label" class="card-status">{{ label }}</span>
    </span>
    <span class="hero-info"><strong>{{ hero.name }}</strong><small>{{ sublabel || hero.heroType.name }}</small></span>
  </button>
</template>
