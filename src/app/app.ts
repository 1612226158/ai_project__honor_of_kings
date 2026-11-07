/**
 * 选人页根组件（第 8 课 8.2 第 4 条 / 8.8 第五站）。
 *
 * 职责边界（与 Vue 版 `DraftPage.vue` 的「归属三问」一致）：
 * - 对局状态与动作 → `DraftStore`（DI 容器托管的单例）；
 * - 页面局部状态（搜索词、职业、读秒、两个定时器句柄）→ 本组件，切页即失效；
 * - 界面文案派生 → 本组件，结果以 input 下发给六个组件。
 *
 * 结构上必须保留 `.draft-page → .site-header → .draft-shell` 三层：
 * 「严格一屏」的高度计算全部挂在 `.draft-page`（styles.css:839-884）。
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core'

import { FilterBar } from '../components/filter-bar/filter-bar'
import { HeroPool } from '../components/hero-pool/hero-pool'
import { PhasePanel } from '../components/phase-panel/phase-panel'
import { SiteHeader } from '../components/site-header/site-header'
import { TeamSlots } from '../components/team-slots/team-slots'
import { ALL_HEROES } from '../data/heroes'
import { AUTO_STEP_MS, DraftStore, MY_SEAT, SETTINGS, STEPS } from '../game/draft-store'
import type { DraftToken, Hero, Side, StepMark } from '../rules/types'

// ── 筛选常量（与 Vue 版同序，勿随意重排）──
const ROLE_CHIPS = ['坦克', '战士', '法师', '刺客', '射手', '辅助']

// 搜索命中「英雄名」或「称号」，结果分三档排序；档内保持 ALL_HEROES 原顺序
const MATCH_NAME_PREFIX = 0
const MATCH_NAME_INNER = 1
const MATCH_TITLE_ONLY = 2

function matchRank(hero: Hero, kw: string): number {
  if (!kw) return MATCH_NAME_PREFIX
  if (hero.name.startsWith(kw)) return MATCH_NAME_PREFIX
  if (hero.name.includes(kw)) return MATCH_NAME_INNER
  if (hero.title.includes(kw)) return MATCH_TITLE_ONLY
  return -1 // 不命中
}

const SIDE_TEXT: Record<Side, string> = { blue: '蓝方', red: '红方' }
const ACTION_TEXT = { ban: '禁用英雄', pick: '选择英雄' } as const

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiteHeader, PhasePanel, TeamSlots, HeroPool, FilterBar],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  /** 向框架要实例：不自己 new，也不直接 import 函数（8.5 第二站） */
  protected readonly store = inject(DraftStore)

  // ── 页面局部状态（切页即失效，不进 store）──
  protected readonly keyword = signal('')
  /** 职业筛选是单选：`''` = 全部，再次点击已选中的职业即取消回全部 */
  protected readonly selectedRole = signal('')
  protected readonly secondsLeft = signal<number | null>(null)

  protected readonly roleChips = ROLE_CHIPS
  protected readonly settings = SETTINGS
  protected readonly mySeat = MY_SEAT
  /** `MY_SEAT.side` 是字面量 `'blue'`，直接与 `'red'` 比较会被 TS 判为无重叠；转成 Side 再比 */
  private readonly mySide: Side = MY_SEAT.side

  private autoTimer: ReturnType<typeof setTimeout> | undefined
  private countdownTimer: ReturnType<typeof setInterval> | undefined

  // ── 搜索 + 职业筛选（职业匹配主职或副职任一）──
  private readonly matched = computed(() => {
    const kw = this.keyword().trim()
    const role = this.selectedRole()
    const items: { hero: Hero; rank: number }[] = []
    for (const hero of ALL_HEROES) {
      if (role && hero.heroType.name !== role && (hero.heroType2?.name ?? '') !== role) continue
      const rank = matchRank(hero, kw)
      if (rank === -1) continue
      items.push({ hero, rank })
    }
    if (kw) items.sort((a, b) => a.rank - b.rank)
    return items
  })

  protected readonly visibleHeroes = computed(() => this.matched().map((it) => it.hero))
  protected readonly heroCount = computed(() => this.visibleHeroes().length)

  /** 仅称号命中的卡片，第二行改显示称号，让用户一眼看出命中原因 */
  protected readonly subLabels = computed<Record<number, string>>(() => {
    const table: Record<number, string> = {}
    if (!this.keyword().trim()) return table
    for (const { hero, rank } of this.matched()) {
      if (rank === MATCH_TITLE_ONLY) table[hero.id] = hero.title
    }
    return table
  })

  // ── 界面文案派生（只服务本页；组件不猜阶段）──
  protected readonly turnEyebrow = computed(() => {
    const phase = this.store.phase()
    if (phase === 'confirm') return 'DRAFT COMPLETE'
    const no = String(this.store.stepIndex() + 1).padStart(2, '0')
    return `TURN ${no} / ${STEPS.length} · ${phase === 'ban' ? 'BAN' : 'PICK'}`
  })

  protected readonly turnTitleText = computed(() => {
    const phase = this.store.phase()
    return phase === 'confirm' ? '双方阵容已确定' : ACTION_TEXT[phase]
  })

  protected readonly turnSubText = computed(() => {
    const phase = this.store.phase()
    if (phase === 'confirm') return '双方各 5 位英雄已选定，可确认阵容'
    const verb = phase === 'ban' ? '禁用' : '选择'
    if (this.store.isMyTurn()) {
      return this.store.myIntent() == null
        ? `轮到你：先点一张卡预选，再点同一张卡${verb}`
        : `轮到你：点「${this.store.intentName()}」确认${verb}`
    }
    const side = this.store.currentSide()
    const n = (side === 'blue' ? this.store.bluePicks() : this.store.redPicks()).length + 1
    return `等待${side ? SIDE_TEXT[side] : ''}第 ${n} 位玩家${verb}…`
  })

  protected readonly stepMarks = computed<StepMark[]>(() => {
    const phase = this.store.phase()
    return [
      { no: '01', label: '禁用英雄', state: phase === 'ban' ? 'current' : 'complete' },
      {
        no: '02',
        label: '选择英雄',
        state: phase === 'ban' ? '' : phase === 'pick' ? 'current' : 'complete',
      },
      { no: '03', label: '确认阵容', state: phase === 'confirm' ? 'current' : '' },
    ]
  })

  protected readonly bannedNote = computed(() =>
    this.store.phase() === 'ban' ? '' : '禁用阶段已完成',
  )

  protected readonly subhead = computed(() => {
    if (this.store.myPicksDone()) return '本局你的禁用与选择已完成'
    return this.store.isMyTurn() ? '轮到你 · 先预选再确认' : '全部英雄'
  })

  /** 只有「我的座位」在轮到我时才标 active，队友位永远不亮 */
  protected readonly blueActiveNo = computed(() =>
    this.store.isMyTurn() && this.mySide === 'blue' ? MY_SEAT.slot : 0,
  )
  protected readonly redActiveNo = computed(() =>
    this.store.isMyTurn() && this.mySide === 'red' ? MY_SEAT.slot : 0,
  )

  protected readonly done = computed(() => this.store.phase() === 'confirm')

  protected teamStatus(side: Side): string {
    if (this.store.phase() === 'confirm') return '已完成'
    const current = this.store.currentSide()
    if (current !== side) return `等待${current ? SIDE_TEXT[current] : ''}选择`
    return this.store.isMyTurn() ? '轮到你选择' : '当前选择方'
  }

  // ── 生命周期：ngOnInit 只启动代选链；销毁时两个定时器都要停 ──
  ngOnInit(): void {
    this.restartTimers()
  }

  ngOnDestroy(): void {
    this.clearAuto()
    this.stopTimer()
  }

  // ── 交互 ──
  protected onChoose(id: number): void {
    this.store.handleCardClick(id, this.store.token())
    this.restartTimers()
  }

  protected onReset(): void {
    this.clearAuto()
    this.store.reset()
    this.restartTimers()
  }

  protected onSearch(value: string): void {
    this.keyword.set(value)
  }

  protected onRole(role: string): void {
    this.selectedRole.set(role)
  }

  // ── 系统代选（700 ms 链）：只在非我的步推进；轮到我时暂停 ──
  private scheduleAuto(): void {
    this.clearAuto()
    if (this.store.isFinished() || this.store.isMyTurn()) return
    this.autoTimer = setTimeout(() => {
      if (this.store.autoStep()) this.restartTimers()
    }, AUTO_STEP_MS)
  }

  private clearAuto(): void {
    if (this.autoTimer !== undefined) clearTimeout(this.autoTimer)
    this.autoTimer = undefined
  }

  // ── 倒计时：只在我的限时步起表；换步满秒重起 ──
  private startTimer(): void {
    this.stopTimer()
    const total = this.store.stepSeconds()
    if (total == null) return // 系统步 / 禁用不限时 / 已结束 → 面板显示 `--`
    const token: DraftToken = this.store.token() // 令牌在起表这一刻冻结
    this.secondsLeft.set(total)
    this.countdownTimer = setInterval(() => {
      // 令牌失效（已推进/已重置）→ 立刻停表，绝不继续倒数或落账
      if (!this.store.isTokenValid(token)) {
        this.stopTimer()
        return
      }
      const next = (this.secondsLeft() ?? total) - 1
      this.secondsLeft.set(next)
      if (next <= 0) {
        this.stopTimer() // 先停表，再落账
        this.store.autoAssign(token)
        this.restartTimers()
      }
    }, 1000)
  }

  private stopTimer(): void {
    if (this.countdownTimer !== undefined) clearInterval(this.countdownTimer)
    this.countdownTimer = undefined
    this.secondsLeft.set(null)
  }

  /** 动作只改状态；表与代选链由这里统一重启（与 Vue 4.9 同口径） */
  private restartTimers(): void {
    this.startTimer()
    this.scheduleAuto()
  }
}
