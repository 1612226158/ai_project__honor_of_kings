// 应用页头：产品标识 + 当前征召规则。
// 与 Vue 版 App.vue 的差别（已按开发步骤 0.4「品牌区可简化，规则指示可后置」处理）：
//   - 无主导航：React 版是单页，没有设置页/海报页，挂两个点不动的链接比不挂更糟。
//   - 保留 match-mode 规则指示，口径与 Vue 版一致（「标准征召 | 蓝方先手」）。
// 结构必须保留 .site-header > .header-inner 两层，否则「严格一屏」的高度计算会错位。

const PRESET_TEXT = { standard: '标准征召', simple: '简单交替' }
const SIDE_TEXT = { blue: '蓝方', red: '红方' }

export default function SiteHeader({ preset, firstSide }) {
  const rulesLabel = `当前规则：${PRESET_TEXT[preset]}，${SIDE_TEXT[firstSide]}先手`

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 3 27 7v8c0 7-4.6 11.4-11 14-6.4-2.6-11-7-11-14V7l11-4Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="m11 11 10 10m0-10L11 21M9 9l4 1m10-1-4 1M9 23l4-1m10 1-4-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span className="brand-copy">
            <strong>
              HEROS <span>BP</span>
            </strong>
            <small>英雄征召工作台</small>
          </span>
        </div>

        <div className="match-mode" aria-label={rulesLabel}>
          <span className="status-dot" aria-hidden="true" />
          <span>{PRESET_TEXT[preset]}</span>
          <span className="mode-divider" aria-hidden="true" />
          <span>{SIDE_TEXT[firstSide]}先手</span>
        </div>
      </div>
    </header>
  )
}
