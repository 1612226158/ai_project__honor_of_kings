/**
 * 对局规则层（第 7 课 7.2）。
 *
 * 定位：**纯模块** —— 不 import React、不 import 英雄数据、不含定时器/随机数/DOM。
 * 对应 Vue 版 stores/draft.js 的规则部分；页面专属的调度（700ms 代选、倒计时、预选失效监听）
 * 留在 App.jsx，因为它们依赖 React 生命周期。
 *
 * 三条硬约束：
 *   1. reducer 不可变更新，绝不修改传入 state；
 *   2. reducer 内不取随机数、不读时钟，重复执行结果必须一致（StrictMode 会重复调用）；
 *   3. 英雄对象由调用方传入（来自验证过的 allHeroes），本模块不查数据表。
 *
 * 与 Vue 版的一处有意偏离：预选被他人拿走时，Vue 的 act() 会静默清空预选，
 * 使页面里的「预选已清除」提示不可达；本模块改为在他人步保留预选，
 * 由 App 的失效 effect 清除并给出提示（详见 reducer 内注释）。
 */
import { buildSequence } from '../rules/sequence.js'

// ── 规则参数（React 版无设置页，写死默认值）──
export const SETTINGS = {
  pickSeconds: 20, // 选人每步限时（秒）
  banTimed: false, // 禁用阶段限时；开启后我的 ban 步同用 pickSeconds
  firstSide: 'blue', // 先手方
  preset: 'standard', // 顺序预设
}

/** 20 步顺序表，模块级常量，永不变化 */
export const STEPS = buildSequence(SETTINGS.preset, SETTINGS.firstSide)

/** 我的座位：一局 10 人各 1 ban + 1 pick，我占蓝方第 3 位 */
export const MY_SEAT = { side: 'blue', slot: 3 }

/** 系统代选节拍（毫秒） */
export const AUTO_STEP_MS = 700

/** 单方选人上限 / 禁用上限 */
const CAPACITY = { ban: 10, pick: 5 }

/**
 * 座位 → 步号。把该方所有 ban 步、pick 步各按出现顺序取第 slot 个。
 * 与 Vue 版 seatSteps 同算法（不用 push，保持本文件无原地修改）。
 *
 * @param {{side:string, action:string}[]} list 顺序表
 * @param {'blue'|'red'} side
 * @param {number} slot 1–5
 * @returns {{ban:number, pick:number}} 取不到时为 -1
 */
export function seatSteps(list, side, slot) {
  const banIdx = list.flatMap((s, i) => (s.side === side && s.action === 'ban' ? [i] : []))
  const pickIdx = list.flatMap((s, i) => (s.side === side && s.action === 'pick' ? [i] : []))
  return { ban: banIdx[slot - 1] ?? -1, pick: pickIdx[slot - 1] ?? -1 }
}

/** 我的两个步号：标准征召蓝先手下为 { ban: 4, pick: 14 } */
export const MY_STEPS = seatSteps(STEPS, MY_SEAT.side, MY_SEAT.slot)

/**
 * 初始对局状态。
 * 比 Vue 的 store 少三项：settings/steps 是常量，result 快照在本版不实现（无海报页）。
 *
 * @param {number} epoch 局令牌
 */
export function createDraft(epoch = 0) {
  return {
    epoch,
    stepIndex: 0,
    banned: [],
    bluePicks: [],
    redPicks: [],
    myIntent: null,
    intentNotice: '',
  }
}

/**
 * 卡片业务态（不含预选）：回答「这张卡还能不能被落账」。
 * 顺序必须是 banned → 蓝 → 红，与 Vue 一致。
 *
 * @returns {''|'banned'|'picked-blue'|'picked-red'}
 */
export function cardStateOf(state, id) {
  if (state.banned.some((h) => h.id === id)) return 'banned'
  if (state.bluePicks.some((h) => h.id === id)) return 'picked-blue'
  if (state.redPicks.some((h) => h.id === id)) return 'picked-red'
  return ''
}

/** 我的 pick 一旦落账，本局我的两次操作全部用完 → 整池锁定 */
const isLocked = (state) => state.stepIndex > MY_STEPS.pick

/** 当前步要写进哪个数组 */
const bucketOf = (step) =>
  step.action === 'ban' ? 'banned' : step.side === 'blue' ? 'bluePicks' : 'redPicks'

/** 三名单并集，用于查重 */
const usedIdsOf = (state) =>
  new Set([...state.banned, ...state.bluePicks, ...state.redPicks].map((h) => h.id))

/**
 * 对局 reducer。五类动作：reset / preselect / invalidateIntent / choose / auto。
 * 未知动作一律原样返回（StrictMode 会重复调用，抛错会白屏）。
 */
export function draftReducer(state, action) {
  if (!action || typeof action.type !== 'string') return state

  switch (action.type) {
    case 'reset':
      // 即使原本就在第 0 步也递增，确保旧局回调全部失效
      return createDraft(state.epoch + 1)

    case 'preselect': {
      if (isLocked(state)) return state
      const { heroId } = action
      if (!Number.isInteger(heroId)) return state
      if (cardStateOf(state, heroId) !== '') return state
      // 再点同一张 = 取消预选
      return { ...state, myIntent: state.myIntent === heroId ? null : heroId, intentNotice: '' }
    }

    case 'invalidateIntent': {
      const { heroId, notice = '' } = action
      // 只清「当前这个预选」，避免并发时误清别人的
      if (state.myIntent == null || state.myIntent !== heroId) return state
      return { ...state, myIntent: null, intentNotice: notice }
    }

    case 'choose':
    case 'auto': {
      const { expected } = action
      // ① 令牌比对：旧帧、旧步、旧局的提交一律拒绝
      if (!expected || expected.epoch !== state.epoch || expected.stepIndex !== state.stepIndex) {
        return state
      }
      // ② 取当前步，走完则拒绝
      const step = STEPS[state.stepIndex]
      if (!step) return state

      // ②.5 choose 只能发生在「我的步」。
      // Vue 版只靠页面 onCardClick 的 isMyTurn 守卫，reducer/act 本身不校验；
      // 这里加一道自校验，避免绕过 UI 直接派发时替别人落账。
      if (
        action.type === 'choose' &&
        state.stepIndex !== MY_STEPS.ban &&
        state.stepIndex !== MY_STEPS.pick
      ) {
        return state
      }

      // ③ 确定英雄：choose 用调用方给的；auto 从最新可用池现算（随机数外部传入）
      const used = usedIdsOf(state)
      let hero = action.hero
      if (action.type === 'auto') {
        const heroes = Array.isArray(action.heroes) ? action.heroes : []
        const pool = heroes.filter((h) => !used.has(h.id))
        if (pool.length === 0) return state
        const random = typeof action.random === 'number' ? action.random : 0
        const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random * pool.length)))
        hero = pool[index]
      }

      // ④ 英雄合法性 + 查重
      if (!hero || !Number.isInteger(hero.id) || used.has(hero.id)) return state

      // ⑤ 容量上限
      const key = bucketOf(step)
      if (state[key].length >= CAPACITY[step.action]) return state

      // ⑥ 不可变落账，最后推进步号
      //
      // 预选由谁清 —— 与 Vue 版有意不同：
      //   Vue 的 act() 只在「落账英雄 === 预选」时静默清空，导致两处问题：
      //     a) 页面里的失效 watch（要求 myIntent 非空）永远看不到占用 → 提示不可达；
      //     b) 我的步超时、系统随机选了别人时，预选残留 → 已锁定的卡上仍挂「预选」角标。
      //   本版改为按「是不是我的步」区分：
      //     我的步（choose / 超时 auto）→ **无条件清空**：这一步就是我的两次操作之一，
      //       落账后预选无论指谁都失去意义，必须清，否则会留下锁定卡上的假角标；
      //     他人的步 auto → 一律保留，交给 App 的失效 effect 清除并给出提示。
      const isMyStep = state.stepIndex === MY_STEPS.pick || state.stepIndex === MY_STEPS.ban
      return {
        ...state,
        [key]: [...state[key], hero],
        stepIndex: state.stepIndex + 1,
        myIntent: isMyStep ? null : state.myIntent,
      }
    }

    default:
      return state
  }
}

/** 池状态：三名单之上再叠预选（显示用，不参与落账判定） */
export function poolStateOf(state) {
  const table = {}
  for (const h of state.banned) table[h.id] = 'banned'
  for (const h of state.bluePicks) table[h.id] = 'picked-blue'
  for (const h of state.redPicks) table[h.id] = 'picked-red'
  if (state.myIntent != null && table[state.myIntent] == null) table[state.myIntent] = 'preselect'
  return table
}

/** 卡片徽标文案 */
const STATE_LABEL = {
  preselect: '预选',
  banned: '已禁用',
  'picked-blue': '蓝方已选',
  'picked-red': '红方已选',
}

/** poolState → labels */
export function labelsOf(poolState) {
  const table = {}
  for (const [id, state] of Object.entries(poolState)) table[id] = STATE_LABEL[state]
  return table
}

/**
 * 一次性算出渲染需要的派生值。
 * 注意：每次调用都返回新对象，App 侧按需用 useMemo 包住。
 */
export function derive(state) {
  const currentStep = STEPS[state.stepIndex] ?? null
  const currentSide = currentStep?.side ?? null
  const phase = currentStep ? currentStep.action : 'confirm'
  const isFinished = state.stepIndex >= STEPS.length
  const isMyTurn = state.stepIndex === MY_STEPS.ban || state.stepIndex === MY_STEPS.pick
  const myPicksDone = state.stepIndex > MY_STEPS.pick

  // 计时口径：只有我的 pick 步计时；banTimed 开启时我的 ban 步也计时；系统步不计时
  const stepSeconds =
    state.stepIndex === MY_STEPS.pick
      ? SETTINGS.pickSeconds
      : state.stepIndex === MY_STEPS.ban && SETTINGS.banTimed
        ? SETTINGS.pickSeconds
        : null

  const poolState = poolStateOf(state)

  return {
    currentStep,
    currentSide,
    phase,
    isFinished,
    isMyTurn,
    myPicksDone,
    stepSeconds,
    pickCount: state.bluePicks.length + state.redPicks.length,
    bannedCount: state.banned.length,
    poolState,
    labels: labelsOf(poolState),
  }
}
