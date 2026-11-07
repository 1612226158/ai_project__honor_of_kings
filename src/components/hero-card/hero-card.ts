/**
 * 一张英雄卡（契约 §2.1）。只负责渲染，不判断禁选规则、不拼徽标文案、不碰业务状态。
 *
 * 两个易错点：
 * 1. `preselect` 态**绝不能 disabled** —— 否则「再点同一张卡确认」永远点不动；
 * 2. 模板里 `hero()` / `state()` 是函数调用（input 返回 signal），漏括号拿到的是 signal 对象。
 */
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'

import type { CardState, Hero } from '../../rules/types'

@Component({
  selector: 'app-hero-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [class]="classes()"
      type="button"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel()"
      (click)="choose.emit(hero().id)"
    >
      <span class="hero-portrait">
        <img
          [src]="hero().images.avatar"
          width="100"
          height="100"
          alt=""
          [attr.loading]="eager() ? 'eager' : 'lazy'"
          decoding="async"
        />
        @if (label()) {
          <span class="card-status">{{ label() }}</span>
        }
      </span>
      <span class="hero-info">
        <strong>{{ hero().name }}</strong>
        <small>{{ sublabel() || hero().heroType.name }}</small>
      </span>
    </button>
  `,
})
export class HeroCard {
  readonly hero = input.required<Hero>()
  /** '' | preselect | banned | picked-blue | picked-red */
  readonly state = input<CardState>('')
  /** 徽标文字，由父级给（组件不内置文案映射） */
  readonly label = input('')
  /** 第二行文案；空则回落到主职业。父级在「仅称号命中」时传称号 */
  readonly sublabel = input('')
  readonly eager = input(false)
  /** 整池锁定：我这局的 ban + pick 已用完，卡片一律不可点（含预选） */
  readonly locked = input(false)

  /** 只报告「有人点了我」，不代表预选或确认 */
  readonly choose = output<number>()

  readonly disabled = computed(
    () => this.locked() || (this.state() !== '' && this.state() !== 'preselect'),
  )

  /** 句式与另两版**逐字一致** */
  readonly ariaLabel = computed(
    () => `${this.label() || '选择'}${this.hero().name}，${this.hero().heroType.name}`,
  )

  /** 与 Vue 的 `class="hero-card" :class="state"` 输出等价（空态不带尾随类名） */
  readonly classes = computed(() => (this.state() ? `hero-card ${this.state()}` : 'hero-card'))
}
