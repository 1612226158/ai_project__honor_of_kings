// 契约对应 heros-vue/src/components/HeroCard.vue：只渲染一张卡，
// 不判断禁选规则、不拼徽标文案、不碰业务状态。徽标与第二行文案都由父级传入。
//
// props（与 Vue 版逐项对齐）：
//   hero     英雄对象（含 images.avatar）
//   state    '' | 'preselect' | 'banned' | 'picked-blue' | 'picked-red'
//   label    徽标文字
//   sublabel 第二行文案，空则退回主职业
//   eager    首屏立即加载头像
//   locked   整池锁定（我这局的 ban + pick 都已完成）
//   onChoose 点击回调，收到 hero.id

const cx = (...names) => names.filter(Boolean).join(' ')

export default function HeroCard({
  hero,
  state = '',
  label = '',
  sublabel = '',
  eager = false,
  locked = false,
  onChoose,
}) {
  // 与 Vue 同一口径：锁池一律不可点；已被占用的状态不可点；预选态仍可点（用于取消/改选）
  const disabled = locked || (state !== '' && state !== 'preselect')

  return (
    <button
      className={cx('hero-card', state)}
      disabled={disabled}
      type="button"
      aria-label={`${label || '选择'}${hero.name}，${hero.heroType.name}`}
      onClick={() => onChoose?.(hero.id)}
    >
      <span className="hero-portrait">
        <img
          src={hero.images.avatar}
          width="100"
          height="100"
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
        {label ? <span className="card-status">{label}</span> : null}
      </span>
      <span className="hero-info">
        <strong>{hero.name}</strong>
        <small>{sublabel || hero.heroType.name}</small>
      </span>
    </button>
  )
}
