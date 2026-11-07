// 对局仓库（第 5 课 5.2–5.6）。
// 归属三问的答案：三页都要读/写的（对局状态、settings、epoch、result）进仓库；
// 只服务选人页的（keyword、selectedRole、secondsLeft、定时器句柄）留在 DraftPage 局部。
// 本文件在大步①「只建不接」——App.vue 的旧逻辑并存，换血完成后旧逻辑删除。
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { allHeroes } from '../data/heroes.js'
import { buildSequence } from '../rules/sequence.js'

export const useDraftStore = defineStore('draft', () => {
  // ── 设置（5.6 起由设置页修改；改任一项 → 重排顺序表 + 重置对局）──
  // failMode（模拟取数失败）按用户决策跳过：数据是编译期 import，无请求可失败。
  const settings = ref({
    pickSeconds: 20, // 选人每步限时（秒）
    banTimed: false, // 禁用阶段限时（基线默认不限时；开启后 ban 步同用 pickSeconds）
    firstSide: 'blue', // 先后手
    preset: 'standard', // 顺序预设
  })

  // ── 对局状态（唯一可写数据，其余一律派生）──
  // steps 用 ref：updateSettings 改先后手/预设时必须重排
  const steps = ref(buildSequence(settings.value.preset, settings.value.firstSide))
  const epoch = ref(0) // 局令牌：每次重置递增，拒绝旧局迟到的动作与回调
  const stepIndex = ref(0) // 0–19 走局中，20 表示走完
  const banned = ref([]) // 已禁英雄（按操作顺序）
  const bluePicks = ref([]) // 蓝方已选
  const redPicks = ref([]) // 红方已选
  const result = ref(null) // confirmDraft 生成的快照；守卫与海报页都只认它

  // 我的预选：单值，只存英雄 id，不进三个名单。放仓库是因为 resetDraft 必须一并清掉。
  const myIntent = ref(null)
  const intentNotice = ref('')

  // ── 我的座位 ──
  // 一局 10 人各有 1 ban + 1 pick，我占蓝方第 3 位（第 5 课设置页不开放座位，保持常量）。
  // 座位 ↔ 步号：ban 段同方每隔 2 步，pick 段按「该方第 k 次出现」——蓝 3 → ban 4 / pick 14。
  const MY_SEAT = { side: 'blue', slot: 3 }

  function seatSteps(list, side, slot) {
    const ban = []
    const pick = []
    list.forEach((s, i) => {
      if (s.side !== side) return
      if (s.action === 'ban') ban.push(i)
      else pick.push(i)
    })
    return { ban: ban[slot - 1] ?? -1, pick: pick[slot - 1] ?? -1 }
  }

  // 我的步号必须跟随顺序表重算：设置页改 firstSide / preset 后这里自动变
  const MY_STEPS = computed(() => seatSteps(steps.value, MY_SEAT.side, MY_SEAT.slot))

  // ── 令牌 ──
  const currentToken = () => ({ epoch: epoch.value, stepIndex: stepIndex.value })
  const isTokenValid = (token) => !!token && token.epoch === epoch.value && token.stepIndex === stepIndex.value

  // ── 派生 ──
  const currentStep = computed(() => steps.value[stepIndex.value] ?? null)
  const currentSide = computed(() => currentStep.value?.side ?? null)
  const currentTurn = computed(() => {
    const s = currentStep.value
    if (!s) return null
    return {
      turnIndex: s.turnIndex,
      side: s.side,
      action: s.action,
      size: s.turnSize,
      indexInTurn: s.indexInTurn,
      remaining: s.turnSize - s.indexInTurn,
    }
  })
  const phase = computed(() => currentStep.value?.action ?? 'confirm')
  const pickCount = computed(() => bluePicks.value.length + redPicks.value.length)
  const bannedCount = computed(() => banned.value.length)
  const isFinished = computed(() => stepIndex.value >= steps.value.length)

  const isMyTurn = computed(() => stepIndex.value === MY_STEPS.value.ban || stepIndex.value === MY_STEPS.value.pick)
  // 我的 pick 一旦落账，本局我的 2 次操作全部用完：整池锁定
  const myPicksDone = computed(() => stepIndex.value > MY_STEPS.value.pick)
  const myAction = computed(() => {
    if (stepIndex.value === MY_STEPS.value.ban) return 'ban'
    if (stepIndex.value === MY_STEPS.value.pick) return 'pick'
    return null
  })

  // 计时口径：只有「我的 pick 步」计时；ban 步按基线不限时（banTimed 开启才计）；
  // 系统步 700ms 即过，不计时。null → 面板显示 `--`。
  const stepSeconds = computed(() => {
    const s = stepIndex.value
    if (s === MY_STEPS.value.pick) return settings.value.pickSeconds
    if (s === MY_STEPS.value.ban && settings.value.banTimed) return settings.value.pickSeconds
    return null
  })

  // ── 卡片业务态（不含 preselect）与显示态（含）──
  // 业务态回答「还能不能被选中」（act 的守卫用）；显示态回答「长什么样」（卡片渲染用）。
  function cardState(id) {
    if (banned.value.some((h) => h.id === id)) return 'banned'
    if (bluePicks.value.some((h) => h.id === id)) return 'picked-blue'
    if (redPicks.value.some((h) => h.id === id)) return 'picked-red'
    return ''
  }

  const STATE_LABEL = {
    preselect: '预选',
    banned: '已禁用',
    'picked-blue': '蓝方已选',
    'picked-red': '红方已选',
  }

  const poolState = computed(() => {
    const t = {}
    for (const h of banned.value) t[h.id] = 'banned'
    for (const h of bluePicks.value) t[h.id] = 'picked-blue'
    for (const h of redPicks.value) t[h.id] = 'picked-red'
    if (myIntent.value != null && t[myIntent.value] == null) t[myIntent.value] = 'preselect'
    return t
  })
  const labels = computed(() => {
    const t = {}
    for (const [id, state] of Object.entries(poolState.value)) t[id] = STATE_LABEL[state]
    return t
  })

  // ── 动作 ──
  // 落账：唯一写三个名单的入口。token 由调用方显式传入，函数内不重读。
  function act(heroId, token) {
    if (!isTokenValid(token)) return false
    const step = currentStep.value
    if (!step) return false
    if (cardState(heroId) !== '') return false
    const hero = allHeroes.find((h) => h.id === heroId)
    if (!hero) return false
    const target = step.action === 'ban' ? banned : step.side === 'blue' ? bluePicks : redPicks
    if (target.value.length >= (step.action === 'ban' ? 10 : 5)) return false
    target.value.push(hero)
    if (myIntent.value === heroId) myIntent.value = null
    stepIndex.value += 1
    return true
  }

  function availableHeroes() {
    return allHeroes.filter((h) => cardState(h.id) === '')
  }

  // 系统代选：只从可用池取；我的步绝不代选（页面持有 700ms 定时器，只调这个函数）
  function autoStep() {
    if (isFinished.value || isMyTurn.value) return false
    const pool = availableHeroes()
    if (!pool.length) return false
    return act(pool[Math.floor(Math.random() * pool.length)].id, currentToken())
  }

  // 超时随机：与系统代选同样从完整可用池取（不受搜索/职业筛选影响——那些状态不在仓库）
  function autoAssign(token) {
    if (!isTokenValid(token)) return false
    const pool = availableHeroes()
    if (!pool.length) return false
    return act(pool[Math.floor(Math.random() * pool.length)].id, token)
  }

  // 确认：生成快照。必须 slice() 复制，切断与对局数组的引用——
  // 之后重开新局不影响已确认的海报；result 也被路由守卫用来判断能否进海报页。
  function confirmDraft() {
    if (phase.value !== 'confirm') return false
    result.value = {
      bluePicks: bluePicks.value.slice(),
      redPicks: redPicks.value.slice(),
      banned: banned.value.slice(),
      settings: { ...settings.value },
      confirmedAt: new Date().toISOString(),
    }
    return true
  }

  // 重置：清对局与快照，设置保留。epoch 递增即使原本就在第 0 步——旧局令牌必须失效。
  function resetDraft() {
    stepIndex.value = 0
    banned.value = []
    bluePicks.value = []
    redPicks.value = []
    myIntent.value = null
    intentNotice.value = ''
    result.value = null
    epoch.value += 1
  }

  // 改设置：重排顺序表 + 重置对局。改任一项都会让进行中的对局作废（用户在设置页已被告知）。
  function updateSettings(partial) {
    settings.value = { ...settings.value, ...partial }
    steps.value = buildSequence(settings.value.preset, settings.value.firstSide)
    resetDraft()
  }

  return {
    // 状态
    settings,
    steps,
    epoch,
    stepIndex,
    banned,
    bluePicks,
    redPicks,
    result,
    myIntent,
    intentNotice,
    // 英雄常量（只读；供测试脚本与未来需要，动作内部同样经此查找）
    allHeroes,
    // 派生
    MY_SEAT,
    MY_STEPS,
    currentStep,
    currentSide,
    currentTurn,
    phase,
    pickCount,
    bannedCount,
    isFinished,
    isMyTurn,
    myPicksDone,
    myAction,
    stepSeconds,
    cardState,
    poolState,
    labels,
    currentToken,
    isTokenValid,
    availableHeroes,
    // 动作
    act,
    autoStep,
    autoAssign,
    confirmDraft,
    resetDraft,
    updateSettings,
  }
})
