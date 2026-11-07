/**
 * 征召顺序表（纯函数，不依赖 Vue）。
 *
 * 一局 20 步：前 10 步 ban、后 10 步 pick。
 * 但这 20 步不是 20 个独立回合——**同一方连续的步属于同一个「轮次」（turn）**：
 *   标准征召 pick 段节奏 F S S F F S S F F S
 *   → 轮次为 F(1) / S(2) / F(2) / S(2) / F(2) / S(1)，共 6 轮 10 位。
 * 同一轮内两位英雄是同一队的两个位置，可以同时/连续选取，**回合方不切换**。
 * （ban 段是双方交替，每轮 count 恒为 1。）
 *
 * 模板里的 F = 先手方（first side）、S = 后手方，具体颜色由 firstSide 决定。
 */

const BAN_TEMPLATES = {
  standard: 'FSFSFSFSFS',
  simple: 'FSFSFSFSFS',
}

const PICK_TEMPLATES = {
  // 标准征召：先手 1、后手 2、先手 2、后手 2、先手 2、后手 1
  standard: 'FSSFFSSFFS',
  // 简单交替：双方轮流各一位
  simple: 'FSFSFSFSFS',
}

const other = (side) => (side === 'blue' ? 'red' : 'blue')
const sideOf = (ch, firstSide) => (ch === 'F' ? firstSide : other(firstSide))

/**
 * 展开成「轮次」：相邻的同方、同动作为一轮，count 表示这一轮要选/禁几位。
 *
 * @param {'standard'|'simple'} preset
 * @param {'blue'|'red'} firstSide
 * @returns {{ side: 'blue'|'red', action: 'ban'|'pick', count: number }[]}
 */
export function buildTurns(preset, firstSide) {
  const banTpl = BAN_TEMPLATES[preset]
  const pickTpl = PICK_TEMPLATES[preset]
  if (!banTpl || !pickTpl) throw new Error(`未知的 preset：${preset}`)
  if (firstSide !== 'blue' && firstSide !== 'red') throw new Error(`未知的 firstSide：${firstSide}`)

  const turns = []
  for (const [action, tpl] of [
    ['ban', banTpl],
    ['pick', pickTpl],
  ]) {
    for (const ch of tpl) {
      const side = sideOf(ch, firstSide)
      const last = turns[turns.length - 1]
      if (last && last.action === action && last.side === side) last.count += 1
      else turns.push({ side, action, count: 1 })
    }
  }
  return turns
}

/**
 * 展开成逐步的顺序表（20 条），并给每一步打上轮次标记，
 * 供界面判断「本轮还剩几位」「是否本轮第一位」「是否本轮最后一位」。
 *
 * @param {'standard'|'simple'} preset
 * @param {'blue'|'red'} firstSide
 * @returns {{
 *   side: 'blue'|'red', action: 'ban'|'pick',
 *   turnIndex: number, indexInTurn: number, turnSize: number,
 *   isFirstOfTurn: boolean, isLastOfTurn: boolean,
 *   isFirstOfAction: boolean, isLastOfAction: boolean,
 * }[]}
 */
export function buildSequence(preset, firstSide) {
  const turns = buildTurns(preset, firstSide)
  const steps = []
  turns.forEach((turn, turnIndex) => {
    for (let k = 0; k < turn.count; k++) {
      steps.push({
        side: turn.side,
        action: turn.action,
        turnIndex,
        indexInTurn: k,
        turnSize: turn.count,
        isFirstOfTurn: k === 0,
        isLastOfTurn: k === turn.count - 1,
        isFirstOfAction: steps.length === 0,
        isLastOfAction: false,
      })
    }
  })
  // 回填「本阶段最后一步」（ban 段结束 / pick 段结束），供阶段文案使用
  const lastBan = steps.map((s) => s.action).lastIndexOf('ban')
  const lastPick = steps.map((s) => s.action).lastIndexOf('pick')
  ;[lastBan, lastPick].forEach((i) => {
    if (i >= 0 && steps[i].isLastOfTurn) steps[i].isLastOfAction = true
  })
  return steps
}
