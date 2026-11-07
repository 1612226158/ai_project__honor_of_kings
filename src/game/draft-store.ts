/**
 * 对局仓库（第 8 课 8.5）：对局状态的**唯一可写入口**。
 *
 * 与 Vue 版 `stores/draft.js`（Pinia）一一对应：`signal` 承担 ref 的角色、`computed` 承担派生、
 * 方法就是 action。与 React 版的差别只在「状态住哪」——这里住 DI 容器托管的单例服务。
 *
 * 本文件不碰 DOM、不持有任何计时器：700 ms 代选链与倒计时都在根组件（8.8），
 * 因为它们的生命周期归组件，而归服务会导致「切页停不掉」。
 */
import { Injectable, computed, signal } from '@angular/core'

import { ALL_HEROES } from '../data/heroes'
import { buildSequence, seatSteps } from '../rules/sequence'
import type { CardState, DraftToken, Hero, Occupied, Side } from '../rules/types'

/** 无设置页的单页版：规则恒为「标准征召 + 蓝方先手 + 每步 20 秒 + 禁用不限时」 */
export const SETTINGS = {
  pickSeconds: 20,
  banTimed: false,
  firstSide: 'blue',
  preset: 'standard',
} as const

/** 20 步，模块级常量（无设置页，永不变） */
export const STEPS = buildSequence(SETTINGS.preset, SETTINGS.firstSide)

/** 我的座位：一局 10 人各有 1 ban + 1 pick，我占蓝方第 3 位 */
export const MY_SEAT = { side: 'blue', slot: 3 } as const

/** 我的两处步号：蓝 3 → ban 4 / pick 14（已被断言脚本锁定） */
export const MY_STEPS = seatSteps(STEPS, MY_SEAT.side, MY_SEAT.slot)

/** 系统代选每步延时（毫秒） */
export const AUTO_STEP_MS = 700

/** 徽标文案表。**必须含五个键**（含空串），否则 strictTemplates 下索引不合法 */
export const STATE_LABEL: Record<CardState, string> = {
  '': '',
  preselect: '预选',
  banned: '已禁用',
  'picked-blue': '蓝方已选',
  'picked-red': '红方已选',
}

@Injectable({ providedIn: 'root' })
export class DraftStore {
  // ── 对局状态（唯一可写数据）──
  private readonly _epoch = signal(0)
  private readonly _stepIndex = signal(0)
  private readonly _banned = signal<Hero[]>([])
  private readonly _bluePicks = signal<Hero[]>([])
  private readonly _redPicks = signal<Hero[]>([])
  /** 我的预选：只存英雄 id，**不写入上面三个名单** */
  private readonly _myIntent = signal<number | null>(null)
  /** 预选失效提示，一行文案，空串不显示 */
  private readonly _intentNotice = signal('')

  // ── 只读视图（组件只能读，不能写）──
  readonly epoch = this._epoch.asReadonly()
  readonly stepIndex = this._stepIndex.asReadonly()
  readonly banned = this._banned.asReadonly()
  readonly bluePicks = this._bluePicks.asReadonly()
  readonly redPicks = this._redPicks.asReadonly()
  readonly myIntent = this._myIntent.asReadonly()
  readonly intentNotice = this._intentNotice.asReadonly()

  // ── 派生 ──
  readonly currentStep = computed(() => STEPS[this._stepIndex()] ?? null)
  readonly currentSide = computed<Side | null>(() => this.currentStep()?.side ?? null)
  readonly phase = computed<'ban' | 'pick' | 'confirm'>(() => this.currentStep()?.action ?? 'confirm')
  readonly pickCount = computed(() => this._bluePicks().length + this._redPicks().length)
  readonly bannedCount = computed(() => this._banned().length)
  readonly isFinished = computed(() => this._stepIndex() >= STEPS.length)

  /** 轮到我：只在我的 ban 步 / pick 步为 true */
  readonly isMyTurn = computed(() => {
    const i = this._stepIndex()
    return i === MY_STEPS.ban || i === MY_STEPS.pick
  })

  /** 我的 pick 一旦落账，本局我的两次操作全部用完 → 整池锁定 */
  readonly myPicksDone = computed(() => this._stepIndex() > MY_STEPS.pick)

  readonly myAction = computed<'ban' | 'pick' | null>(() => {
    const i = this._stepIndex()
    if (i === MY_STEPS.ban) return 'ban'
    if (i === MY_STEPS.pick) return 'pick'
    return null
  })

  /**
   * 计时口径：**只有我的 pick 步计时**；banTimed 开启时我的 ban 步也计；
   * 系统步 700ms 即过、不计时。null → 面板显示 `--`。
   */
  readonly stepSeconds = computed<number | null>(() => {
    const i = this._stepIndex()
    if (i === MY_STEPS.pick) return SETTINGS.pickSeconds
    if (i === MY_STEPS.ban && SETTINGS.banTimed) return SETTINGS.pickSeconds
    return null
  })

  /** 本次渲染的令牌常量；点击时携带，落账时与最新 state 比对 */
  readonly token = computed<DraftToken>(() => ({
    epoch: this._epoch(),
    stepIndex: this._stepIndex(),
  }))

  /** 显示态表（含 preselect）。业务判定不要用它 —— 用 cardState() */
  readonly poolState = computed<Record<number, CardState>>(() => {
    const table: Record<number, CardState> = {}
    for (const h of this._banned()) table[h.id] = 'banned'
    for (const h of this._bluePicks()) table[h.id] = 'picked-blue'
    for (const h of this._redPicks()) table[h.id] = 'picked-red'
    const intent = this._myIntent()
    // 预选态必须进表，且不能覆盖已占用态
    if (intent != null && table[intent] == null) table[intent] = 'preselect'
    return table
  })

  /** 徽标文案表，与 poolState 同键 */
  readonly labels = computed<Record<number, string>>(() => {
    const table: Record<number, string> = {}
    for (const [id, state] of Object.entries(this.poolState())) {
      table[Number(id)] = STATE_LABEL[state]
    }
    return table
  })

  // ── 查询 ──

  /** 业务态：**不含 preselect** —— 预选是显示态，不能参与占用判定 */
  cardState(id: number): Occupied | '' {
    if (this._banned().some((h) => h.id === id)) return 'banned'
    if (this._bluePicks().some((h) => h.id === id)) return 'picked-blue'
    if (this._redPicks().some((h) => h.id === id)) return 'picked-red'
    return ''
  }

  isTokenValid(token: DraftToken | null): boolean {
    return !!token && token.epoch === this._epoch() && token.stepIndex === this._stepIndex()
  }

  /** 完整可用池（不受搜索/职业筛选影响 —— 那些状态在组件里，规则层读不到） */
  availableHeroes(): Hero[] {
    return ALL_HEROES.filter((h) => this.cardState(h.id) === '')
  }

  /** 我的预选英雄名（找不到返回空串） */
  intentName(): string {
    const id = this._myIntent()
    if (id == null) return ''
    return ALL_HEROES.find((h) => h.id === id)?.name ?? ''
  }

  // ── 动作 ──

  /**
   * 落账：唯一写三个名单的入口。token 由调用方传入，**函数内不重读**（契约 C3 五步提交）。
   */
  act(heroId: number, token: DraftToken): boolean {
    if (!this.isTokenValid(token)) return false
    const step = this.currentStep()
    if (!step) return false
    if (this.cardState(heroId) !== '') return false

    const hero = ALL_HEROES.find((h) => h.id === heroId)
    if (!hero) return false

    const target =
      step.action === 'ban'
        ? this._banned
        : step.side === 'blue'
          ? this._bluePicks
          : this._redPicks
    if (target().length >= (step.action === 'ban' ? 10 : 5)) return false

    // 必须是新数组：signal 的相等检查按引用，push 不会通知，界面不动
    target.update((prev) => [...prev, hero])
    this._stepIndex.update((i) => i + 1)
    return true
  }

  /**
   * 系统代选：只在非我的步；候选池 = 全量可用池。轮到我时**绝不**代选。
   *
   * 落账后立刻检查预选是否被系统取走 —— 他人的步**保留**预选，交给这里清除并给提示。
   * 若像 Vue 版那样在 `act()` 里顺手静默清空，这条提示将永远不出现（契约 C5.4 已记录该缺陷）。
   */
  autoStep(): boolean {
    if (this.isFinished() || this.isMyTurn()) return false
    const pool = this.availableHeroes()
    if (!pool.length) return false
    const landed = this.act(pool[Math.floor(Math.random() * pool.length)]!.id, this.token())
    if (landed) this.invalidateIntentIfTaken()
    return landed
  }

  /**
   * 超时随机：与代选同口径，但令牌由定时器在起表那一刻冻结。
   * 这是**我的步**，无论随机到谁，我的预选都已被消耗 → 无条件清空（Vue 版会残留角标）。
   */
  autoAssign(token: DraftToken): boolean {
    if (!this.isTokenValid(token)) return false
    const pool = this.availableHeroes()
    if (!pool.length) return false
    const landed = this.act(pool[Math.floor(Math.random() * pool.length)]!.id, token)
    if (landed) this._myIntent.set(null)
    return landed
  }

  /**
   * 点击（两段式，契约 C5.1）：
   * - 我的操作已结束 → 完全无效（逻辑层防线，DOM 的 disabled 只是表现层）；
   * - 轮到我且点的正是预选 → 落账；否则只改预选。
   */
  handleCardClick(heroId: number, token: DraftToken): void {
    if (this.myPicksDone()) return
    if (!this.isTokenValid(token)) return
    if (this.cardState(heroId) !== '') return
    if (this.isMyTurn() && this._myIntent() === heroId) {
      if (this.act(heroId, token)) this._myIntent.set(null) // 我的步：预选随落账一起消耗
      return
    }
    this._myIntent.set(this._myIntent() === heroId ? null : heroId)
    this._intentNotice.set('')
  }

  /**
   * 重置：清三名单与预选提示，epoch +1（**即使原本就在第 0 步**，旧局令牌必须失效）。
   * 设置保留（本版无设置页）。
   */
  reset(): void {
    this._stepIndex.set(0)
    this._banned.set([])
    this._bluePicks.set([])
    this._redPicks.set([])
    this._myIntent.set(null)
    this._intentNotice.set('')
    this._epoch.update((e) => e + 1)
  }

  // ── 内部 ──

  private invalidateIntentIfTaken(): void {
    const id = this._myIntent()
    if (id == null) return
    const state = this.cardState(id)
    if (state === '') return

    const name = ALL_HEROES.find((h) => h.id === id)?.name ?? '预选英雄'
    const how = state === 'banned' ? '禁用' : state === 'picked-blue' ? '蓝方选择' : '红方选择'
    this._intentNotice.set(`你预选的「${name}」已被${how}，预选已清除`)
    this._myIntent.set(null)
  }
}
