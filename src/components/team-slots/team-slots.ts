/**
 * 一方五槽（契约 §2.4）：纯展示，无事件。
 *
 * 两条不能回退的口径：
 * 1. `heroes` 传**真实已选数组**（0–5 位），组件内部自己补空位；
 *    传定长 5 的数组会让 `team-count` 恒显示「5 / 5」。
 * 2. `lanes` 可能为空（138 / 547 / 549），必须 `lanes[0] ?? '—'` 兜底。
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'

import type { Hero, Side } from '../../rules/types'

const TEAM_NAME: Record<Side, string> = { blue: '蓝方', red: '红方' }
const TEAM_EN: Record<Side, string> = { blue: 'BLUE TEAM', red: 'RED TEAM' }
const SLOT_COUNT = 5

@Component({
  selector: 'app-team-slots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class]="'team-slots ' + side()" [attr.aria-labelledby]="side() + '-team-title'">
      <header class="team-header">
        <div class="team-identity">
          <span class="team-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="m12 3 7 3v5c0 4.6-2.9 7.6-7 10-4.1-2.4-7-5.4-7-10V6l7-3Z"
                stroke="currentColor"
                stroke-width="1.7"
              />
            </svg>
          </span>
          <div>
            <h2 [id]="side() + '-team-title'">{{ teamName() }}</h2>
            <span>{{ teamEn() }}</span>
          </div>
        </div>
        <span class="team-count"><b>{{ heroes().length }}</b> / 5</span>
      </header>
      <div [class]="isDim() ? 'team-status waiting' : 'team-status'">
        <span class="status-dot" aria-hidden="true"></span>{{ statusText() }}
      </div>

      <ol class="slot-list">
        @for (h of slots(); track $index; let i = $index) {
          <li [class]="slotClass(h, i + 1)">
            <span class="slot-number">{{ slotNo(i) }}</span>
            @if (h) {
              <img [src]="h.images.avatar" width="52" height="52" alt="" />
              <span class="slot-info">
                <strong>{{ h.name }}</strong><span>{{ h.title }}</span>
                <small>{{ h.heroType.name }} · {{ h.lanes[0] ?? '—' }}</small>
              </span>
            } @else {
              <span [class]="activeNo() === i + 1 ? 'placeholder-icon' : 'placeholder-icon empty'" aria-hidden="true">
                @if (activeNo() === i + 1) {
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                  </svg>
                }
              </span>
              <span class="slot-info">
                <strong>{{ activeNo() === i + 1 ? '等待选择' : '待选择' }}</strong>
                @if (activeNo() === i + 1) {
                  <span>当前位置</span>
                }
              </span>
            }
          </li>
        }
      </ol>
    </section>
  `,
})
export class TeamSlots {
  readonly side = input.required<Side>()
  /** 该方已选，按顺序，0–5 位 */
  readonly heroes = input.required<Hero[]>()
  /** 需要高亮的槽位序号（1–5）；0 = 本回合不亮任何槽 */
  readonly activeNo = input(0)
  readonly statusText = input.required<string>()
  /**
   * 状态行是否灰显。语义是「不是本方在选择」而不是「不轮到我」，故由父级判定；
   * 不传（null）时回落到 `activeNo === 0`。
   */
  readonly dim = input<boolean | null>(null)

  readonly teamName = computed(() => TEAM_NAME[this.side()])
  readonly teamEn = computed(() => TEAM_EN[this.side()])
  readonly isDim = computed(() => {
    const dim = this.dim()
    return dim == null ? this.activeNo() === 0 : dim
  })
  /** 真实已选数组 → 定长 5，空位补 null（只在组件内部补，不外传） */
  readonly slots = computed<(Hero | null)[]>(() =>
    Array.from({ length: SLOT_COUNT }, (_, i) => this.heroes()[i] ?? null),
  )

  slotNo(i: number): string {
    return String(i + 1).padStart(2, '0')
  }

  slotClass(hero: Hero | null, no: number): string {
    const base = hero ? 'slot slot-filled' : 'slot slot-placeholder'
    return !hero && this.activeNo() === no ? `${base} active` : base
  }
}
