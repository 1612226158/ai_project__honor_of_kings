<script setup>
// 契约见 docs/contracts/组件契约.md §2.2：受控组件，值全部来自 props，只向上抛 update:*
defineProps({
  keyword: { type: String, required: true },
  role: { type: String, required: true }, // '' = 全部
  roleChips: { type: Array, required: true },
})

const emit = defineEmits(['update:keyword', 'update:role'])
</script>

<template>
  <div class="filter-bar">
    <div class="filter-search">
      <label class="sr-only" for="hero-search">搜索英雄</label>
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="m13 13 3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input
        id="hero-search"
        :value="keyword"
        type="search"
        placeholder="搜索英雄名称或称号"
        autocomplete="off"
        @input="emit('update:keyword', $event.target.value)"
      >
    </div>
    <div class="role-chips" role="group" aria-label="按职业筛选（单选）">
      <button
        class="role-chip"
        :class="{ on: !role }"
        :aria-pressed="!role"
        type="button"
        @click="emit('update:role', '')"
      >
        全部
      </button>
      <button
        v-for="r in roleChips"
        :key="r"
        class="role-chip"
        :class="{ on: role === r }"
        :aria-pressed="role === r"
        type="button"
        @click="emit('update:role', role === r ? '' : r)"
      >
        {{ r }}
      </button>
    </div>
  </div>
</template>
