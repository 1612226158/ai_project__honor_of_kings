/**
 * 英雄池（契约 §2.3）：容器组件，**不做过滤、不判态、不计数**，全部由父级传入。
 * 筛选栏 `app-filter-bar` 由父级投放到 `<ng-content>`（原型里它就长在池列内）。
 */
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'

import type { CardState, Hero } from '../../rules/types'
import { HeroCard } from '../hero-card/hero-card'

/** 首屏立即加载的卡片数：约两屏；其余 lazy，浏览器会在接近视口前预取 */
const EAGER_COUNT = 24

@Component({
  selector: 'app-hero-pool',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HeroCard],
  template: `
    <section class="pool-column" id="hero-pool" aria-labelledby="pool-title">
      <header class="pool-heading">
        <div>
          <span class="eyebrow">HERO POOL</span>
          <h2 id="pool-title">选择英雄</h2>
        </div>
        <span class="pool-total">共 <strong>{{ count() }}</strong> 位英雄</span>
      </header>

      <ng-content />

      <div class="pool-subhead">
        <span>{{ subhead() }}</span>
        <div class="pool-legend" aria-label="卡片状态说明">
          <span><i class="legend-dot available" aria-hidden="true"></i>可选择</span>
          <span><i class="legend-dot preselect" aria-hidden="true"></i>预选</span>
          <span><i class="legend-dot selected" aria-hidden="true"></i>已选择</span>
          <span><i class="legend-dot disabled" aria-hidden="true"></i>已禁用</span>
        </div>
      </div>

      @if (notice()) {
        <p class="pool-notice" role="status">{{ notice() }}</p>
      }

      <div class="pool-scroll">
        @if (heroes().length === 0) {
          <div class="pool-empty">没有符合条件的英雄，请更换关键词或职业。</div>
        } @else {
          <div class="pool-grid" role="group" aria-label="英雄列表">
            @for (h of heroes(); track h.id; let index = $index) {
              <app-hero-card
                [hero]="h"
                [state]="poolState()[h.id] ?? ''"
                [label]="labels()[h.id] ?? ''"
                [sublabel]="subLabels()[h.id] ?? ''"
                [eager]="index < EAGER_COUNT"
                [locked]="locked()"
                (choose)="select.emit($event)"
              />
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class HeroPool {
  readonly heroes = input.required<Hero[]>()
  readonly poolState = input.required<Record<number, CardState>>()
  readonly labels = input.required<Record<number, string>>()
  readonly subLabels = input<Record<number, string>>({})
  readonly count = input.required<number>()
  /** 预选失效提示，空串则不显示 */
  readonly notice = input('')
  readonly subhead = input('全部英雄')
  /** 整池锁定，透传给每张卡 */
  readonly locked = input(false)

  /** 原样转发 HeroCard 的 choose，**不改名不改语义** */
  readonly select = output<number>()

  protected readonly EAGER_COUNT = EAGER_COUNT
}
