// 契约对应 heros-vue/src/components/TeamSlots.vue：纯展示，无事件。
//
// props：
//   side       'blue' | 'red'
//   heroes     该方已选，按顺序，0–5 位
//   activeNo   需要高亮的槽位（1–5）；0 = 不亮
//   statusText 状态行文案
//   dim        状态行是否灰显；不传时回落到 activeNo === 0

const TEAM_NAME = { blue: '蓝方', red: '红方' }
const TEAM_EN = { blue: 'BLUE TEAM', red: 'RED TEAM' }

const cx = (...names) => names.filter(Boolean).join(' ')

export default function TeamSlots({ side, heroes, activeNo = 0, statusText, dim = null }) {
  const slots = Array.from({ length: 5 }, (_, i) => heroes[i] ?? null)
  const isDim = dim == null ? activeNo === 0 : dim

  return (
    <section className={cx('team-slots', side)} aria-labelledby={`${side}-team-title`}>
      <header className="team-header">
        <div className="team-identity">
          <span className="team-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="m12 3 7 3v5c0 4.6-2.9 7.6-7 10-4.1-2.4-7-5.4-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </span>
          <div>
            <h2 id={`${side}-team-title`}>{TEAM_NAME[side]}</h2>
            <span>{TEAM_EN[side]}</span>
          </div>
        </div>
        <span className="team-count">
          <b>{heroes.length}</b> / 5
        </span>
      </header>

      <div className={cx('team-status', isDim && 'waiting')}>
        <span className="status-dot" aria-hidden="true" />
        {statusText}
      </div>

      <ol className="slot-list">
        {/* 五槽定长列表，用下标作 key 是安全的 */}
        {slots.map((h, i) => {
          const no = i + 1
          const isNext = !h && activeNo === no
          return (
            <li
              key={no}
              className={cx('slot', h ? 'slot-filled' : 'slot-placeholder', isNext && 'active')}
            >
              <span className="slot-number">{String(no).padStart(2, '0')}</span>
              {h ? (
                <>
                  <img src={h.images.avatar} width="52" height="52" alt="" />
                  <span className="slot-info">
                    <strong>{h.name}</strong>
                    <span>{h.title}</span>
                    {/* lanes 有 3 条为空（138/547/549），必须兜底 */}
                    <small>{h.heroType.name} · {h.lanes[0] ?? '—'}</small>
                  </span>
                </>
              ) : (
                <>
                  <span className={cx('placeholder-icon', !isNext && 'empty')} aria-hidden="true">
                    {isNext ? (
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="slot-info">
                    <strong>{isNext ? '等待选择' : '待选择'}</strong>
                    {isNext ? <span>当前位置</span> : null}
                  </span>
                </>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
