// 契约对应 heros-vue/src/components/FilterBar.vue：受控组件，值全部来自 props，
// 自身不存状态、不过滤，只向上抛两个回调。
//
// props：
//   keyword           搜索词
//   role              当前职业，'' = 全部（单选）
//   roleChips         职业按钮列表
//   onKeywordChange   输入回调，收到新字符串
//   onRoleChange      职业回调，收到 '' 或职业名；再次点击已选职业由本组件折算成 ''

const cx = (...names) => names.filter(Boolean).join(' ')

export default function FilterBar({
  keyword,
  role,
  roleChips,
  onKeywordChange,
  onRoleChange,
}) {
  return (
    <div className="filter-bar">
      <div className="filter-search">
        <label className="sr-only" htmlFor="hero-search">
          搜索英雄
        </label>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="m13 13 3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          id="hero-search"
          value={keyword}
          type="search"
          placeholder="搜索英雄名称或称号"
          autoComplete="off"
          onChange={(e) => onKeywordChange(e.currentTarget.value)}
        />
      </div>
      <div className="role-chips" role="group" aria-label="按职业筛选（单选）">
        <button
          className={cx('role-chip', !role && 'on')}
          aria-pressed={!role}
          type="button"
          onClick={() => onRoleChange('')}
        >
          全部
        </button>
        {roleChips.map((r) => (
          <button
            key={r}
            className={cx('role-chip', role === r && 'on')}
            aria-pressed={role === r}
            type="button"
            // 与 Vue 版一致：再点已选中的职业 → 回到「全部」
            onClick={() => onRoleChange(role === r ? '' : r)}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}
