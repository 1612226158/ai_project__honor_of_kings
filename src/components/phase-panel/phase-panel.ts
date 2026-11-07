/**
 * 阶段面板（契约 §2.5）：**纯展示** + reset 事件。
 * 所有文案（eyebrow / title / sub / steps / bannedNote）都由根组件派生后传入，组件不猜阶段。
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'

import type { Hero, Side, StepMark } from '../../rules/types'

const SIDE_NAME: Record<Side, string> = { blue: '蓝方', red: '红方' }
/** 纯展示阈值：≤5 秒变红，不涉及业务判定 */
const URGENT_SECONDS = 5

@Component({
  selector: 'app-phase-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="phase-panel" aria-labelledby="phase-title">
      <div class="phase-main">
        <div class="turn-block">
          <span [class]="'turn-emblem ' + (side() ?? 'blue')" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="m12 3 7 3v5c0 4.6-2.9 7.6-7 10-4.1-2.4-7-5.4-7-10V6l7-3Z"
                stroke="currentColor"
                stroke-width="1.7"
              />
              <path
                d="m9 12 2 2 4-5"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <div>
            <div class="eyebrow">{{ eyebrow() }}</div>
            <h1 id="phase-title">
              <span [class]="side() === 'red' ? 'red-text' : 'blue-text'">{{ sideName() }}</span>{{ title() }}
            </h1>
            <p>{{ sub() }}</p>
          </div>
        </div>

        <ol class="phase-steps" aria-label="征召流程">
          @for (m of steps(); track m.no) {
            <li [class]="m.state" [attr.aria-current]="m.state === 'current' ? 'step' : null">
              <span class="step-index" aria-hidden="true">
                @if (m.state === 'complete') {
                  <svg viewBox="0 0 16 16" fill="none">
                    <path
                      d="m4 8 2.5 2.5L12 5"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                } @else {
                  {{ m.no }}
                }
              </span>
              <span>{{ m.label }}</span>
            </li>
          }
        </ol>

        <div class="phase-actions">
          <div [class]="urgent() ? 'countdown urgent' : 'countdown'" role="timer" [attr.aria-label]="timerLabel()">
            <div class="countdown-copy">
              <span>本轮剩余</span>
              <strong>{{ secondsText() }}<small>秒</small></strong>
            </div>
            <div class="countdown-track" aria-hidden="true">
              <div class="countdown-fill" [style.width.%]="fillPercent()"></div>
            </div>
          </div>
          <button class="btn-reset" type="button" (click)="reset.emit()">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M4.2 7A6.2 6.2 0 1 1 4 12.5M4.2 7V3.5M4.2 7h3.5"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            重置对局
          </button>
        </div>
      </div>

      <div class="banned-strip">
        <div class="banned-label">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5" />
            <path d="m5.2 5.2 9.6 9.6" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <span>本局禁用</span>
          <strong>{{ bannedCount() }}<span>/ 10</span></strong>
        </div>
        <ul class="banned-list" aria-label="已禁用英雄">
          @for (h of banned(); track h.id) {
            <li>
              <img [src]="h.images.avatar" width="36" height="36" alt="" [title]="h.name" />
              <span class="sr-only">{{ h.name }}</span>
            </li>
          }
        </ul>
        @if (bannedNote()) {
          <span class="ban-note">{{ bannedNote() }}</span>
        }
      </div>
    </section>
  `,
})
export class PhasePanel {
  /** 左上角小字（如 `TURN 05 / 20 · BAN`） */
  readonly eyebrow = input.required<string>()
  /** 主标题动作部分（如「禁用英雄」），方名由 side 前缀 */
  readonly title = input.required<string>()
  readonly sub = input.required<string>()
  /** `null` 表示已完成 */
  readonly side = input<Side | null>(null)
  readonly steps = input.required<StepMark[]>()
  readonly banned = input.required<Hero[]>()
  readonly bannedCount = input.required<number>()
  /** 倒计时秒数，`null` 显示 `--` */
  readonly seconds = input<number | null>(null)
  /** 本步总秒数，**仅用于进度条比例**；为 null 时进度条满格 */
  readonly secondsTotal = input<number | null>(null)
  /** 禁用条右侧注记，空串不显示；由父级判断阶段，组件不猜 */
  readonly bannedNote = input('')

  readonly reset = output<void>()

  readonly sideName = computed(() => {
    const side = this.side()
    return side ? SIDE_NAME[side] : ''
  })
  readonly secondsText = computed(() => (this.seconds() == null ? '--' : this.seconds()))
  readonly urgent = computed(() => {
    const s = this.seconds()
    return s != null && s <= URGENT_SECONDS
  })
  readonly fillPercent = computed(() => {
    const s = this.seconds()
    const total = this.secondsTotal()
    if (s == null || !total) return 100
    return Math.max(0, Math.min(100, (s / total) * 100))
  })
  readonly timerLabel = computed(() => {
    const s = this.seconds()
    return s == null ? '本步不限时' : `本轮剩余 ${s} 秒`
  })
}
