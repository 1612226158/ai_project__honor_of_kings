<script setup>
// 对局设置页（第 5 课 5.11）：4 项设置（按用户决策跳过 failMode——数据是编译期 import，无请求可失败）。
// 点击即调仓库 updateSettings：重排顺序表 + 重置对局（改任一项都会作废进行中的对局，面板 tip 已告知）。
// 改完留在本页，用 role="status"（aria-live polite）播报结果，不自动跳回。
// 设置只存内存，刷新回默认值（原型 settings-note 口径）。
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDraftStore } from '../stores/draft.js'

const store = useDraftStore()
const { settings } = storeToRefs(store)

const PICK_SECONDS = [10, 20, 30]
const SIDES = [
  { value: 'blue', label: '蓝方先' },
  { value: 'red', label: '红方先' },
]
const PRESETS = [
  { value: 'standard', label: '标准征召' },
  { value: 'simple', label: '简单交替' },
]

const liveNotice = ref('')
function announce(text) {
  liveNotice.value = text
}

function pickSeconds(sec) {
  if (settings.value.pickSeconds === sec) return
  store.updateSettings({ pickSeconds: sec })
  announce(`每步限时已改为 ${sec} 秒，当前对局已重置`)
}

function pickSide(side) {
  if (settings.value.firstSide === side) return
  store.updateSettings({ firstSide: side })
  announce(`先后手已改为${side === 'blue' ? '蓝方先' : '红方先'}，顺序表已重排，当前对局已重置`)
}

function pickPreset(preset) {
  if (settings.value.preset === preset) return
  store.updateSettings({ preset })
  announce(`顺序预设已改为${preset === 'standard' ? '标准征召' : '简单交替'}，当前对局已重置`)
}

function toggleBanTimed() {
  const next = !settings.value.banTimed
  store.updateSettings({ banTimed: next })
  announce(next ? '禁用阶段限时已开启，当前对局已重置' : '禁用阶段限时已关闭，当前对局已重置')
}
</script>

<template>
  <main class="settings-page">
    <div class="settings-panel">
      <h2>对局设置</h2>
      <p class="tip">修改设置立即生效，并会重置当前对局。</p>

      <!-- 设置项：每步限时 pickSeconds -->
      <div class="setting-item">
        <div>
          <div class="label">每步限时</div>
          <div class="desc">选择阶段每步倒计时，归零后系统随机分配</div>
        </div>
        <div class="seg" role="group" aria-label="每步限时">
          <button
            v-for="sec in PICK_SECONDS"
            :key="sec"
            type="button"
            :class="{ on: settings.pickSeconds === sec }"
            :aria-pressed="settings.pickSeconds === sec"
            @click="pickSeconds(sec)"
          >
            {{ sec }} 秒
          </button>
        </div>
      </div>

      <!-- 设置项：禁用阶段限时 banTimed -->
      <div class="setting-item">
        <div>
          <div class="label">禁用阶段限时</div>
          <div class="desc">打开后禁用阶段同样倒计时，超时随机禁一位</div>
        </div>
        <button
          class="switch"
          :class="{ on: settings.banTimed }"
          type="button"
          role="switch"
          :aria-checked="settings.banTimed"
          aria-label="禁用阶段限时"
          @click="toggleBanTimed"
        ></button>
      </div>

      <!-- 设置项：先后手 firstSide -->
      <div class="setting-item">
        <div>
          <div class="label">先后手</div>
          <div class="desc">顺序表按此生成，先手方先禁先选</div>
        </div>
        <div class="seg" role="group" aria-label="先后手">
          <button
            v-for="s in SIDES"
            :key="s.value"
            type="button"
            :class="{ on: settings.firstSide === s.value }"
            :aria-pressed="settings.firstSide === s.value"
            @click="pickSide(s.value)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <!-- 设置项：顺序预设 preset -->
      <div class="setting-item">
        <div>
          <div class="label">顺序预设</div>
          <div class="desc">标准征召：选择阶段蛇形（先1 后2 先2 后2 先1）；简单交替：全程一替一步</div>
        </div>
        <div class="seg" role="group" aria-label="顺序预设">
          <button
            v-for="p in PRESETS"
            :key="p.value"
            type="button"
            :class="{ on: settings.preset === p.value }"
            :aria-pressed="settings.preset === p.value"
            @click="pickPreset(p.value)"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <p class="settings-note">设置保存在本局内存中，刷新页面回到默认值。</p>
      <p class="settings-live" role="status" aria-live="polite">{{ liveNotice }}</p>
    </div>
  </main>
</template>
