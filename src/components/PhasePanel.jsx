// 契约对应 heros-vue/src/components/PhasePanel.vue：纯展示 + 一个 reset 回调。
// 文案（eyebrow/title/sub/steps/bannedNote）全部由父级派生后传入，本组件不判断对局规则。
//
// props：
//   eyebrow      眉标，如「TURN 04 / 20 · BAN」
//   title        动作部分，如「禁用英雄」；方名由 side 决定
//   sub          说明文案
//   side         'blue' | 'red' | null
//   steps        [{ no, label, state }]，state: '' | 'current' | 'complete'
//   banned       已禁用英雄数组
//   bannedCount  已禁用数量
//   seconds      剩余秒数；null → 显示 --
//   secondsTotal 本步总秒数，仅用于进度条比例
//   bannedNote   禁用条右侧备注，空串不显示
//   onReset      重置回调

const SIDE_NAME = { blue: '蓝方', red: '红方' }
const URGENT_SECONDS = 5 // 纯展示阈值：≤5 秒变红，不涉及业务判定

const cx = (...names) => names.filter(Boolean).join(' ')

export default function PhasePanel({
  eyebrow,
  title,
  sub,
  side = null,
  steps,
  banned,
  bannedCount,
  seconds = null,
  secondsTotal = null,
  bannedNote = '',
  onReset,
}) {
  const sideName = side ? SIDE_NAME[side] : ''
  const secondsText = seconds == null ? '--' : seconds
  const urgent = seconds != null && seconds <= URGENT_SECONDS
  // 与 Vue 版同一算法：不限时或没有总时长时进度条满格
  const fillPercent =
    seconds == null || !secondsTotal
      ? 100
      : Math.max(0, Math.min(100, (seconds / secondsTotal) * 100))
  const timerLabel = seconds == null ? '本步不限时' : `本轮剩余 ${seconds} 秒`

  return (
    <section className="phase-panel" aria-labelledby="phase-title">
      <div className="phase-main">
        <div className="turn-block">
          <span className={cx('turn-emblem', side ?? 'blue')} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="m12 3 7 3v5c0 4.6-2.9 7.6-7 10-4.1-2.4-7-5.4-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.7" />
              <path d="m9 12 2 2 4-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h1 id="phase-title">
              <span className={side === 'red' ? 'red-text' : 'blue-text'}>{sideName}</span>
              {title}
            </h1>
            <p>{sub}</p>
          </div>
        </div>

        <ol className="phase-steps" aria-label="征召流程">
          {steps.map((m) => (
            <li key={m.no} className={m.state} aria-current={m.state === 'current' ? 'step' : undefined}>
              <span className="step-index" aria-hidden="true">
                {m.state === 'complete' ? (
                  <svg viewBox="0 0 16 16" fill="none">
                    <path d="m4 8 2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  m.no
                )}
              </span>
              <span>{m.label}</span>
            </li>
          ))}
        </ol>

        <div className="phase-actions">
          <div className={cx('countdown', urgent && 'urgent')} role="timer" aria-label={timerLabel}>
            <div className="countdown-copy">
              <span>本轮剩余</span>
              <strong>
                {secondsText}
                <small>秒</small>
              </strong>
            </div>
            <div className="countdown-track" aria-hidden="true">
              {/* 宽度必须是内联对象的字符串百分数，不能传纯数字 */}
              <div className="countdown-fill" style={{ width: `${fillPercent}%` }} />
            </div>
          </div>
          <button className="btn-reset" type="button" onClick={onReset}>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4.2 7A6.2 6.2 0 1 1 4 12.5M4.2 7V3.5M4.2 7h3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            重置对局
          </button>
        </div>
      </div>

      <div className="banned-strip">
        <div className="banned-label">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="m5.2 5.2 9.6 9.6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span>本局禁用</span>
          <strong>
            {bannedCount}
            <span>/ 10</span>
          </strong>
        </div>
        <ul className="banned-list" aria-label="已禁用英雄">
          {banned.map((h) => (
            <li key={h.id}>
              <img src={h.images.avatar} width="36" height="36" alt="" title={h.name} />
              <span className="sr-only">{h.name}</span>
            </li>
          ))}
        </ul>
        {bannedNote ? <span className="ban-note">{bannedNote}</span> : null}
      </div>
    </section>
  )
}
