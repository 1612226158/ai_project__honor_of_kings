<script setup>
// 选人页（5.9 大步③ 换血完成）：对局状态与动作全部来自 Pinia 仓库；
// 本页只保留两类东西——「切页应消失」的局部状态（筛选、倒计时、定时器句柄）
// 与只服务本页的展示文案派生。模板结构与大步② 平移时一致。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'

import { allHeroes } from '../data/heroes.js'
import { useDraftStore } from '../stores/draft.js'
import PhasePanel from '../components/PhasePanel.vue'
import TeamSlots from '../components/TeamSlots.vue'
import HeroPool from '../components/HeroPool.vue'
import FilterBar from '../components/FilterBar.vue'

const store = useDraftStore()
const router = useRouter()

// ── 仓库状态与派生（必须用 storeToRefs 保响应式；直接解构会断）──
// 注意：MY_SEAT 是普通对象常量（非 ref），storeToRefs 会跳过它——曾踩坑：
// 从 storeToRefs 解构 MY_SEAT 得 undefined，isMyTurn 变 true 时 blueActiveNo
// 首次读 MY_SEAT.value 抛错，渲染从 step 4 起整个中断（页面卡在旧画面）。
const {
  steps, epoch, stepIndex, banned, bluePicks, redPicks,
  myIntent, intentNotice,
  MY_STEPS, currentStep, currentSide, currentTurn, phase,
  pickCount, bannedCount, isFinished, isMyTurn, myPicksDone,
  stepSeconds, poolState, labels,
} = storeToRefs(store)
// 函数型成员与非响应式常量（MY_SEAT）不在 storeToRefs 里，走 store 实例解构
const {
  MY_SEAT,
  cardState, currentToken, isTokenValid, availableHeroes, act, autoStep, autoAssign, confirmDraft,
} = store

// ── 筛选（页面局部：切页即清空，验收矩阵 A18 口径）──
const keyword = ref('')
// 职业筛选是单选：'' 表示「全部」，再次点击已选中的职业即取消回到全部
const selectedRole = ref('')
const roleChips = ['坦克', '战士', '法师', '刺客', '射手', '辅助']

function pickRole(role) {
  selectedRole.value = selectedRole.value === role ? '' : role
}

// 搜索命中「英雄名」或「称号」，结果分三档排序：
//   0 = 名字以关键词开头   1 = 名字中间含关键词   2 = 仅称号含关键词
// 三档内保持 allHeroes 原顺序（Array.prototype.sort 在 V8 稳定）。
const MATCH_NAME_PREFIX = 0
const MATCH_NAME_INNER = 1
const MATCH_TITLE_ONLY = 2

function matchRank(hero, kw) {
  if (!kw) return MATCH_NAME_PREFIX
  if (hero.name.startsWith(kw)) return MATCH_NAME_PREFIX
  if (hero.name.includes(kw)) return MATCH_NAME_INNER
  if (hero.title.includes(kw)) return MATCH_TITLE_ONLY
  return -1 // 不命中
}

const matchedHeroes = computed(() => {
  const kw = keyword.value.trim()
  const role = selectedRole.value
  const items = []
  for (const h of allHeroes) {
    if (role && h.heroType.name !== role && (h.heroType2?.name ?? '') !== role) continue
    const rank = matchRank(h, kw)
    if (rank === -1) continue
    items.push({ hero: h, rank })
  }
  if (kw) items.sort((a, b) => a.rank - b.rank)
  return items
})

const visibleHeroes = computed(() => matchedHeroes.value.map((it) => it.hero))

// 仅称号命中的卡片，第二行改显示称号，让用户一眼看出命中原因
const subLabels = computed(() => {
  const kw = keyword.value.trim()
  const map = {}
  if (!kw) return map
  for (const { hero, rank } of matchedHeroes.value) {
    if (rank === MATCH_TITLE_ONLY) map[hero.id] = hero.title
  }
  return map
})

const intentName = computed(() => {
  if (myIntent.value == null) return ''
  return allHeroes.find((h) => h.id === myIntent.value)?.name ?? ''
})

// ── 点击与预选（两段式：随时可预选，轮到我且点的是预选才落账）──
function onCardClick(id, token) {
  if (myPicksDone.value) return // 我的操作已结束，点卡无任何效果
  if (!isTokenValid(token)) return // 旧帧 / 旧局的点击，丢弃
  if (cardState(id) !== '') return
  if (isMyTurn.value && myIntent.value === id) {
    act(id, token)
    return
  }
  myIntent.value = myIntent.value === id ? null : id
  intentNotice.value = ''
}

// 渲染时捕获令牌：若 DOM 停在旧帧，点击携带旧令牌 → 被仓库拒绝。
const selectHandler = computed(() => {
  const token = currentToken()
  return (id) => onCardClick(id, token)
})

// ── 系统代选（定时器句柄留页面，仓库不持有定时器）──
const AUTO_STEP_MS = 700
let autoTimer = null
function scheduleAuto() {
  clearTimeout(autoTimer)
  if (isFinished.value || isMyTurn.value) return
  autoTimer = setTimeout(() => {
    if (autoStep()) scheduleAuto()
  }, AUTO_STEP_MS)
}

// ── 倒计时（secondsLeft 留页面：切页暂停、返回从满秒重开，不是后台继续计时）──
const secondsLeft = ref(null)
let countdownTimer = undefined

function stopTimer() {
  if (countdownTimer !== undefined) clearInterval(countdownTimer)
  countdownTimer = undefined
  secondsLeft.value = null
}

function startTimer() {
  stopTimer()
  const secs = stepSeconds.value
  if (secs == null) return // 不是我的计时步：ban 不限时（未开 banTimed）、系统步转瞬即过、confirm 已结束
  const token = currentToken()
  secondsLeft.value = secs
  countdownTimer = setInterval(() => {
    // 令牌失效（已推进/已重置）→ 立刻停表，绝不继续倒数或落账
    if (!isTokenValid(token)) {
      stopTimer()
      return
    }
    secondsLeft.value -= 1
    if (secondsLeft.value <= 0) {
      stopTimer()
      autoAssign(token)
    }
  }, 1000)
}

onMounted(scheduleAuto)
onBeforeUnmount(() => {
  clearTimeout(autoTimer)
  stopTimer()
})
// 我确认后 isMyTurn 变 false，立刻接着推进
watch(isMyTurn, (mine) => {
  if (!mine) scheduleAuto()
})
// 唯一起表入口：动作只改业务状态，计时由 watcher 重启（4.9）。
// immediate 必须开：中途离页再回来 / 刷新页面时正好轮到我，组件挂载时步号没变过，
// 不 immediate 就永远不起表（5.13 联调旅程 A18 抓出）。
watch([epoch, stepIndex], startTimer, { flush: 'post', immediate: true })

// 预选失效：被别人抢走 / 被禁 → 自动清除 + 一行提示
watch(
  [banned, bluePicks, redPicks],
  () => {
    const id = myIntent.value
    if (id == null) return
    const state = cardState(id)
    if (!state) return
    const name = allHeroes.find((h) => h.id === id)?.name ?? '预选英雄'
    const how = state === 'banned' ? '禁用' : state === 'picked-blue' ? '蓝方选择' : '红方选择'
    intentNotice.value = `你预选的「${name}」已被${how}，预选已清除`
    myIntent.value = null
  },
  { deep: true },
)

// 重置：清页面定时器 → 仓库重置（epoch+1、清名单与 result）→ 重启代选
function resetDraft() {
  clearTimeout(autoTimer)
  store.resetDraft()
  scheduleAuto()
}

// 确认 → 生成快照 → 跳海报（仓库内校验 phase === 'confirm'，失败不跳）
function confirmAndGo() {
  if (confirmDraft()) router.push('/poster')
}

// ── 界面文案派生（只服务本页）──────────────────────────────
const sideText = { blue: '蓝方', red: '红方' }
const actionText = { ban: '禁用英雄', pick: '选择英雄' }

// 队伍状态行文案：轮到我本方 → 「轮到你选择」；本方在选 → 「当前选择方」；否则等待对方
function teamStatus(side) {
  if (phase.value === 'confirm') return '已完成'
  if (currentSide.value !== side) return `等待${sideText[currentSide.value]}选择`
  return isMyTurn.value ? '轮到你选择' : '当前选择方'
}

// 只有「我的座位」在轮到我时才标 active，队友位永远不亮
const blueActiveNo = computed(() => (isMyTurn.value && MY_SEAT.side === 'blue' ? MY_SEAT.slot : 0))
const redActiveNo = computed(() => (isMyTurn.value && MY_SEAT.side === 'red' ? MY_SEAT.slot : 0))

const bannedNote = computed(() => (phase.value === 'ban' ? '' : '禁用阶段已完成'))
const subhead = computed(() => {
  if (myPicksDone.value) return '本局你的禁用与选择已完成'
  return isMyTurn.value ? '轮到你 · 先预选再确认' : '全部英雄'
})

const turnEyebrow = computed(() => {
  if (phase.value === 'confirm') return 'DRAFT COMPLETE'
  const no = String(stepIndex.value + 1).padStart(2, '0')
  return `TURN ${no} / ${steps.value.length} · ${phase.value === 'ban' ? 'BAN' : 'PICK'}`
})
const turnTitleText = computed(() => {
  if (phase.value === 'confirm') return '双方阵容已确定'
  return actionText[phase.value]
})
const turnSubText = computed(() => {
  if (phase.value === 'confirm') return '双方各 5 位英雄已选定，可确认阵容'
  const verb = phase.value === 'ban' ? '禁用' : '选择'
  if (isMyTurn.value) {
    return myIntent.value == null
      ? `轮到你：先点一张卡预选，再点同一张卡${verb}`
      : `轮到你：点「${intentName.value}」确认${verb}`
  }
  const n =
    (currentSide.value === 'blue' ? bluePicks.value : redPicks.value).length + 1
  return `等待${sideText[currentSide.value]}第 ${n} 位玩家${verb}…`
})
const stepMarks = computed(() => [
  { no: '01', label: '禁用英雄', state: phase.value === 'ban' ? 'current' : 'complete' },
  { no: '02', label: '选择英雄', state: phase.value === 'ban' ? '' : phase.value === 'pick' ? 'current' : 'complete' },
  { no: '03', label: '确认阵容', state: phase.value === 'confirm' ? 'current' : '' },
])
const canConfirmDraft = computed(() => phase.value === 'confirm')
</script>

<template>
  <div class="draft-shell">
      <!-- 阶段面板：当前回合、征召进度、倒计时与禁用名单 -->
      <PhasePanel
        :eyebrow="turnEyebrow"
        :title="turnTitleText"
        :sub="turnSubText"
        :side="currentSide"
        :steps="stepMarks"
        :banned="banned"
        :banned-count="bannedCount"
        :seconds="secondsLeft"
        :seconds-total="stepSeconds"
        :banned-note="bannedNote"
        @reset="resetDraft"
      />

      <!-- 主工作区：蓝方阵容、英雄池与红方阵容 -->
      <main class="draft-main">
        <TeamSlots
          side="blue"
          :heroes="bluePicks"
          :active-no="blueActiveNo"
          :status-text="teamStatus('blue')"
          :dim="currentSide !== 'blue'"
        />

        <HeroPool
          :heroes="visibleHeroes"
          :pool-state="poolState"
          :labels="labels"
          :sub-labels="subLabels"
          :count="visibleHeroes.length"
          :notice="intentNotice"
          :subhead="subhead"
          :locked="myPicksDone"
          @select="selectHandler"
        >
          <FilterBar v-model:keyword="keyword" v-model:role="selectedRole" :role-chips="roleChips" />
        </HeroPool>

        <TeamSlots
          side="red"
          :heroes="redPicks"
          :active-no="redActiveNo"
          :status-text="teamStatus('red')"
          :dim="currentSide !== 'red'"
        />
      </main>

      <!-- 底部操作区：对局完成度与阵容确认 -->
      <footer class="action-bar">
        <div class="completion-summary">
          <span class="summary-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="M4 10.5 8 14l8-8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <div>
            <strong>{{ phase === 'confirm' ? '双方阵容已确定' : '双方阵容尚未完成' }}</strong>
            <span>已完成 {{ pickCount }} / 10 次选择，双方各选满 5 位英雄后可确认阵容</span>
          </div>
        </div>
        <button class="btn-confirm" type="button" :disabled="!canConfirmDraft" @click="confirmAndGo">
          确认阵容
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </footer>
    </div>
</template>
