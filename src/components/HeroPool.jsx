// 契约对应 heros-vue/src/components/HeroPool.vue：容器组件，不做过滤、不判态、不计数。
// 筛选栏由父级通过 children 接入（原型里它就长在池列内）。
//
// props：
//   heroes    已过滤的可见英雄
//   poolState { [id]: state }
//   labels    { [id]: 徽标文字 }
//   subLabels { [id]: 第二行文案 }
//   locked    整池锁定
//   count     可见数量（由父级算，不在本组件过滤）
//   notice    预选失效提示
//   subhead   池副标题
//   onSelect  选中回调，收到 hero.id
import HeroCard from './HeroCard.jsx'

// 首屏立即加载的卡片数：约两屏；其余 lazy，浏览器会在接近视口前预取
const EAGER_COUNT = 24

export default function HeroPool({
  heroes,
  poolState,
  labels,
  subLabels = {},
  locked = false,
  count,
  notice = '',
  subhead = '全部英雄',
  onSelect,
  children,
}) {
  return (
    <section className="pool-column" id="hero-pool" aria-labelledby="pool-title">
      <header className="pool-heading">
        <div>
          <span className="eyebrow">HERO POOL</span>
          <h2 id="pool-title">选择英雄</h2>
        </div>
        <span className="pool-total">
          共 <strong>{count}</strong> 位英雄
        </span>
      </header>

      {children}

      <div className="pool-subhead">
        <span>{subhead}</span>
        <div className="pool-legend" aria-label="卡片状态说明">
          <span><i className="legend-dot available" aria-hidden="true" />可选择</span>
          <span><i className="legend-dot preselect" aria-hidden="true" />预选</span>
          <span><i className="legend-dot selected" aria-hidden="true" />已选择</span>
          <span><i className="legend-dot disabled" aria-hidden="true" />已禁用</span>
        </div>
      </div>

      {notice ? <p className="pool-notice" role="status">{notice}</p> : null}

      <div className="pool-scroll">
        {heroes.length === 0 ? (
          <div className="pool-empty">没有符合条件的英雄，请更换关键词或职业。</div>
        ) : (
          <div className="pool-grid" role="group" aria-label="英雄列表">
            {heroes.map((h, index) => (
              // key 用 h.id，不用下标 —— 列表会随筛选增删
              <HeroCard
                key={h.id}
                hero={h}
                state={poolState[h.id] ?? ''}
                label={labels[h.id] ?? ''}
                sublabel={subLabels[h.id] ?? ''}
                eager={index < EAGER_COUNT}
                locked={locked}
                onChoose={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
