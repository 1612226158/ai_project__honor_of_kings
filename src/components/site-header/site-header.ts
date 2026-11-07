/**
 * 应用页头（契约：组件契约 v1.7）。
 * 与 Vue 版 `App.vue` 的差别：单页版没有设置页/海报页，所以不挂主导航 ——
 * 放两个点不动的链接比不放更糟。
 *
 * 结构必须保留 `.site-header > .header-inner` 两层，否则「严格一屏」的高度计算会错位。
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'

import type { Side } from '../../rules/types'

const PRESET_TEXT: Record<string, string> = { standard: '标准征召', simple: '简单交替' }
const SIDE_TEXT: Record<Side, string> = { blue: '蓝方', red: '红方' }

@Component({
  selector: 'app-site-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="site-header">
      <div class="header-inner">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path
                d="M16 3 27 7v8c0 7-4.6 11.4-11 14-6.4-2.6-11-7-11-14V7l11-4Z"
                stroke="currentColor"
                stroke-width="1.8"
              />
              <path
                d="m11 11 10 10m0-10L11 21M9 9l4 1m10-1-4 1M9 23l4-1m10 1-4-1"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span class="brand-copy">
            <strong>HEROS <span>BP</span></strong>
            <small>英雄征召工作台</small>
          </span>
        </div>

        <div class="match-mode" [attr.aria-label]="rulesLabel()">
          <span class="status-dot" aria-hidden="true"></span>
          <span>{{ presetText() }}</span>
          <span class="mode-divider" aria-hidden="true"></span>
          <span>{{ sideText() }}先手</span>
        </div>
      </div>
    </header>
  `,
})
export class SiteHeader {
  readonly preset = input('standard')
  readonly firstSide = input<Side>('blue')

  readonly presetText = computed(() => PRESET_TEXT[this.preset()] ?? this.preset())
  readonly sideText = computed(() => SIDE_TEXT[this.firstSide()])
  readonly rulesLabel = computed(() => `当前规则：${this.presetText()}，${this.sideText()}先手`)
}
