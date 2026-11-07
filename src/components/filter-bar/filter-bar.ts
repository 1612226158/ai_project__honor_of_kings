/**
 * 搜索与职业筛选（契约 §2.2）：**受控组件**，值全部来自 input，只向上抛事件。
 * Angular 版不用 `ngModel`（会引入 FormsModule），走 `[value]` + `(input)` 回抛。
 */
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'

@Component({
  selector: 'app-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filter-bar">
      <div class="filter-search">
        <label class="sr-only" for="hero-search">搜索英雄</label>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.6" />
          <path d="m13 13 3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <input
          id="hero-search"
          [value]="keyword()"
          type="search"
          placeholder="搜索英雄名称或称号"
          autocomplete="off"
          (input)="onKeywordInput($event)"
        />
      </div>
      <div class="role-chips" role="group" aria-label="按职业筛选（单选）">
        <button
          [class]="role() ? 'role-chip' : 'role-chip on'"
          [attr.aria-pressed]="!role()"
          type="button"
          (click)="roleChange.emit('')"
        >
          全部
        </button>
        @for (r of roleChips(); track r) {
          <button
            [class]="role() === r ? 'role-chip on' : 'role-chip'"
            [attr.aria-pressed]="role() === r"
            type="button"
            (click)="roleChange.emit(role() === r ? '' : r)"
          >
            {{ r }}
          </button>
        }
      </div>
    </div>
  `,
})
export class FilterBar {
  /** 当前关键词（受控，组件不存副本） */
  readonly keyword = input.required<string>()
  /** 当前职业，`''` = 全部 */
  readonly role = input.required<string>()
  /** 六职业顺序，由父级给 */
  readonly roleChips = input.required<string[]>()

  readonly keywordChange = output<string>()
  readonly roleChange = output<string>()

  onKeywordInput(event: Event): void {
    this.keywordChange.emit((event.target as HTMLInputElement).value)
  }
}
