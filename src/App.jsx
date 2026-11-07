/**
 * 选人页（第 7 课收口形态）。
 *
 * 职责：对局状态（useReducer）、派生（useMemo）、三个 effect（系统代选 / 倒计时 / 预选失效）、
 * 两段式点击、五个业务组件装配、界面文案派生。
 * 规则本身全在 src/game/draft.js，本文件不含任何规则判断。
 *
 * 本版没有结果页/海报页：完成后主按钮变「重新开局」，直接重置（按需求基线，
 * React/Angular 不移植路由、设置页与海报页；2026-11-07 用户确认保持现状）。
 *
 * 结构上必须保留 .draft-page → .site-header → .draft-shell 三层：
 * 「严格一屏」的高度计算全部挂在 .draft-page（style.css:839-884）。
 */
import { useEffect, useMemo, useReducer, useState } from 'react'

import { allHeroes } from './data/heroes.js'
import {
  AUTO_STEP_MS,
  MY_SEAT,
  SETTINGS,
  STEPS,
  cardStateOf,
  createDraft,
  derive,
  draftReducer,
} from './game/draft.js'
import SiteHeader from './components/SiteHeader.jsx'
import PhasePanel from './components/PhasePanel.jsx'
import TeamSlots from './components/TeamSlots.jsx'
import HeroPool from './components/HeroPool.jsx'
import FilterBar from './components/FilterBar.jsx'

// ── 筛选常量（与 Vue 版同序，勿随意重排）──
const ROLE_CHIPS = ['坦克', '战士', '法师', '刺客', '射手', '辅助']

// 搜索命中「英雄名」或「称号」，结果分三档排序；三档内保持 allHeroes 原顺序
const MATCH_NAME_PREFIX = 0
const MATCH_NAME_INNER = 1
const MATCH_TITLE_ONLY = 2

function matchRank(hero, kw) {
  if (!kw) return MATCH_NAME_PREFIX
  if (hero.name.startsWith(kw)) return MATCH_NAME_PREFIX
  if (hero.name.includes(kw)) return MATCH_NAME_INNER
  if (hero.title.includes(kw)) return MATCH_TITLE_ONLY
  return -1 // 不命中
}

// ── 界面文案（与 Vue 版 DraftPage.vue:195-242 对齐）──
const SIDE_TEXT = { blue: '蓝方', red: '红方' }
const ACTION_TEXT = { ban: '禁用英雄', pick: '选择英雄' }

export default function App() {
  // 对局状态：唯一可写数据（规则层 reducer 支撑）
  const [draft, dispatch] = useReducer(draftReducer, undefined, createDraft)
  // 派生：derive 每次返回新对象，用 useMemo 避免 133 张卡每渲染全量重渲
  const d = useMemo(() => derive(draft), [draft])

  // 页面局部状态：切页/刷新即失效，不进对局状态
  const [keyword, setKeyword] = useState('')
  const [selectedRole, setSelectedRole] = useState('') // '' = 全部（单选）
  // 读秒缓存：{ key: 'epoch:stepIndex', seconds }。只在 interval 回调里写，
  // effect 里不同步 setState（否则每次换步都要多渲染一轮）。
  const [countdown, setCountdown] = useState({ key: '', seconds: 0 })

  // 令牌：本次渲染的常量，点击时携带；reducer 用最新 state 比对
  const turnToken = useMemo(
    () => ({ epoch: draft.epoch, stepIndex: draft.stepIndex }),
    [draft.epoch, draft.stepIndex],
  )

  // ── 系统代选：非我的步每 700ms 推进一步 ──
  // 落账后 stepIndex 变 → effect 重跑 → 自动排下一棒；轮到我时直接返回，不排程。
  useEffect(() => {
    if (d.isFinished || d.isMyTurn) return
    const timer = setTimeout(() => {
      dispatch({
        type: 'auto',
        heroes: allHeroes,
        random: Math.random(), // 随机数必须在 reducer 外生成
        expected: { epoch: draft.epoch, stepIndex: draft.stepIndex },
      })
    }, AUTO_STEP_MS)
    return () => clearTimeout(timer)
  }, [draft.epoch, draft.stepIndex, d.isFinished, d.isMyTurn])

  // ── 倒计时：只在我的限时步（pick，或 banTimed 开启时的 ban）起表 ──
  // 换步/重置由 deps 触发重跑：清理旧表 → 满秒重起。
  // 令牌在起表这一刻冻结，归零后的 auto 只能作用于本步，迟到回调会被 reducer 拒掉。
  //
  // 显示值在渲染期派生：缓存 key 与当前步不一致时直接用满秒，
  // 因此 effect 内不需要同步 setState（经 oxlint react(set-state-in-effect) 提示调整）。
  const stepKey = `${draft.epoch}:${draft.stepIndex}`
  const secondsLeft = d.stepSeconds == null
    ? null
    : countdown.key === stepKey
      ? countdown.seconds
      : d.stepSeconds

  useEffect(() => {
    if (d.stepSeconds == null) return
    const expected = { epoch: draft.epoch, stepIndex: draft.stepIndex }
    let remaining = d.stepSeconds
    const timer = setInterval(() => {
      remaining -= 1
      setCountdown({ key: stepKey, seconds: remaining })
      if (remaining <= 0) {
        clearInterval(timer) // 先停表，再落账
        dispatch({
          type: 'auto',
          heroes: allHeroes,
          random: Math.random(),
          expected,
        })
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [draft.epoch, draft.stepIndex, d.stepSeconds, stepKey])

  // ── 预选失效：预选英雄被他人禁掉/选走 → 清预选 + 一行提示 ──
  // 收敛性：派发后 myIntent 变 null，effect 重跑时首行直接 return，不会循环。
  // StrictMode 双调用安全：第二次 myIntent 已为 null，reducer 原样返回，提示不会被覆盖。
  useEffect(() => {
    const id = draft.myIntent
    if (id == null) return
    const state = cardStateOf(draft, id)
    if (state === '') return
    const name = allHeroes.find((h) => h.id === id)?.name ?? '预选英雄'
    const how = state === 'banned' ? '禁用' : state === 'picked-blue' ? '蓝方选择' : '红方选择'
    dispatch({
      type: 'invalidateIntent',
      heroId: id,
      notice: `你预选的「${name}」已被${how}，预选已清除`,
    })
  }, [draft])

  // ── 搜索 + 职业筛选（职业匹配主职或副职任一）──
  // 全程用链式新数组，不用 push（与「规则层/页面均无原地修改」的硬检查口径一致）
  const matchedHeroes = useMemo(() => {
    const kw = keyword.trim()
    const role = selectedRole
    const items = allHeroes
      .filter((h) => !role || h.heroType.name === role || (h.heroType2?.name ?? '') === role)
      .map((h) => ({ hero: h, rank: matchRank(h, kw) }))
      .filter((it) => it.rank !== -1)
    if (kw) items.sort((a, b) => a.rank - b.rank) // items 是 filter 产生的新数组，排序不外泄
    return items
  }, [keyword, selectedRole])

  const visibleHeroes = useMemo(() => matchedHeroes.map((it) => it.hero), [matchedHeroes])

  // 仅称号命中的卡片，第二行改显示称号，让用户一眼看出命中原因
  const subLabels = useMemo(() => {
    const kw = keyword.trim()
    const map = {}
    if (!kw) return map
    for (const { hero, rank } of matchedHeroes) {
      if (rank === MATCH_TITLE_ONLY) map[hero.id] = hero.title
    }
    return map
  }, [keyword, matchedHeroes])

  // ── 点击：两段式（先预选，再点同一张落账）──
  function onCardClick(id) {
    if (d.myPicksDone) return // 我的 pick 已落账 → 整池锁定（逻辑层防线）
    if (cardStateOf(draft, id) !== '') return // 已禁 / 已选
    if (d.isMyTurn && draft.myIntent === id) {
      dispatch({
        type: 'choose',
        hero: allHeroes.find((h) => h.id === id),
        expected: turnToken,
      })
      return
    }
    dispatch({ type: 'preselect', heroId: id })
  }

  const resetDraft = () => dispatch({ type: 'reset' })

  // ── 文案派生 ──
  const intentName = draft.myIntent == null
    ? ''
    : (allHeroes.find((h) => h.id === draft.myIntent)?.name ?? '')

  function teamStatus(side) {
    if (d.phase === 'confirm') return '已完成'
    if (d.currentSide !== side) return `等待${SIDE_TEXT[d.currentSide]}选择`
    return d.isMyTurn ? '轮到你选择' : '当前选择方'
  }

  // 只有「我的座位」在轮到我时才高亮，队友位永远不亮
  const blueActiveNo = d.isMyTurn && MY_SEAT.side === 'blue' ? MY_SEAT.slot : 0
  const redActiveNo = d.isMyTurn && MY_SEAT.side === 'red' ? MY_SEAT.slot : 0

  const bannedNote = d.phase === 'ban' ? '' : '禁用阶段已完成'
  const subhead = d.myPicksDone
    ? '本局你的禁用与选择已完成'
    : d.isMyTurn
      ? '轮到你 · 先预选再确认'
      : '全部英雄'

  const turnEyebrow = d.phase === 'confirm'
    ? 'DRAFT COMPLETE'
    : `TURN ${String(draft.stepIndex + 1).padStart(2, '0')} / ${STEPS.length} · ${d.phase === 'ban' ? 'BAN' : 'PICK'}`

  const turnTitleText = d.phase === 'confirm' ? '双方阵容已确定' : ACTION_TEXT[d.phase]

  function turnSubText() {
    if (d.phase === 'confirm') return '双方各 5 位英雄已选定'
    const verb = d.phase === 'ban' ? '禁用' : '选择'
    if (d.isMyTurn) {
      return draft.myIntent == null
        ? `轮到你：先点一张卡预选，再点同一张卡${verb}`
        : `轮到你：点「${intentName}」确认${verb}`
    }
    const n = (d.currentSide === 'blue' ? draft.bluePicks.length : draft.redPicks.length) + 1
    return `等待${SIDE_TEXT[d.currentSide]}第 ${n} 位玩家${verb}…`
  }

  const stepMarks = [
    { no: '01', label: '禁用英雄', state: d.phase === 'ban' ? 'current' : 'complete' },
    { no: '02', label: '选择英雄', state: d.phase === 'ban' ? '' : d.phase === 'pick' ? 'current' : 'complete' },
    { no: '03', label: '确认阵容', state: d.phase === 'confirm' ? 'current' : '' },
  ]

  const done = d.phase === 'confirm'

  return (
    <div className="draft-page">
      <a className="skip-link" href="#hero-pool">
        跳到英雄池
      </a>

      <SiteHeader preset={SETTINGS.preset} firstSide={SETTINGS.firstSide} />

      <div className="draft-shell">
        <PhasePanel
          eyebrow={turnEyebrow}
          title={turnTitleText}
          sub={turnSubText()}
          side={d.currentSide}
          steps={stepMarks}
          banned={draft.banned}
          bannedCount={d.bannedCount}
          seconds={secondsLeft}
          secondsTotal={d.stepSeconds}
          bannedNote={bannedNote}
          onReset={resetDraft}
        />

        <main className="draft-main">
          <TeamSlots
            side="blue"
            heroes={draft.bluePicks}
            activeNo={blueActiveNo}
            statusText={teamStatus('blue')}
            dim={d.currentSide !== 'blue'}
          />

          <HeroPool
            heroes={visibleHeroes}
            poolState={d.poolState}
            labels={d.labels}
            subLabels={subLabels}
            locked={d.myPicksDone}
            count={visibleHeroes.length}
            notice={draft.intentNotice}
            subhead={subhead}
            onSelect={onCardClick}
          >
            <FilterBar
              keyword={keyword}
              role={selectedRole}
              roleChips={ROLE_CHIPS}
              onKeywordChange={setKeyword}
              onRoleChange={setSelectedRole}
            />
          </HeroPool>

          <TeamSlots
            side="red"
            heroes={draft.redPicks}
            activeNo={redActiveNo}
            statusText={teamStatus('red')}
            dim={d.currentSide !== 'red'}
          />
        </main>

        <footer className="action-bar">
          <div className="completion-summary">
            <span className="summary-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none">
                <path d="M4 10.5 8 14l8-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <strong>{done ? '双方阵容已确定' : '双方阵容尚未完成'}</strong>
              <span>已完成 {d.pickCount} / 10 次选择，双方各选满 5 位英雄后可确认阵容</span>
            </div>
          </div>
          <button className="btn-confirm" type="button" disabled={!done} onClick={resetDraft}>
            {done ? '重新开局' : '确认阵容'}
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </footer>
      </div>
    </div>
  )
}
