/**
 * 征召顺序表（纯函数，不依赖 Angular）。
 *
 * 一局 20 步：前 10 步 ban、后 10 步 pick。
 * 但这 20 步不是 20 个独立回合 —— **同一方连续的步属于同一个「轮次」（turn）**：
 *   标准征召 pick 段节奏 F S S F F S S F F S
 *   → 轮次为 F(1) / S(2) / F(2) / S(2) / F(2) / S(1)，共 6 轮 10 位。
 * 同一轮内两位英雄是同一队的两个位置，可以同时/连续选取，**回合方不切换**。
 * （ban 段是双方交替，每轮 count 恒为 1。）
 *
 * 模板里的 F = 先手方（first side）、S = 后手方，具体颜色由 firstSide 决定。
 */
import type { Side, Step } from './types'

const BAN_TEMPLATES = {
  standard: 'FSFSFSFSFS',
  simple: 'FSFSFSFSFS',
} as const

const PICK_TEMPLATES = {
  // 标准征召：先手 1、后手 2、先手 2、后手 2、先手 2、后手 1
  standard: 'FSSFFSSFFS',
  // 简单交替：双方轮流各一位
  simple: 'FSFSFSFSFS',
} as const

export type Preset = keyof typeof BAN_TEMPLATES

export interface Turn {
  side: Side
  action: 'ban' | 'pick'
  count: number
}

const other = (side: Side): Side => (side === 'blue' ? 'red' : 'blue')
const sideOf = (ch: string, firstSide: Side): Side => (ch === 'F' ? firstSide : other(firstSide))

/**
 * 展开成「轮次」：相邻的同方、同动作为一轮，count 表示这一轮要选/禁几位。
 */
export function buildTurns(preset: Preset, firstSide: Side): Turn[] {
  const banTpl = BAN_TEMPLATES[preset]
  const pickTpl = PICK_TEMPLATES[preset]
  if (!banTpl || !pickTpl) throw new Error(`未知的 preset：${preset}`)
  if (firstSide !== 'blue' && firstSide !== 'red') throw new Error(`未知的 firstSide：${firstSide}`)

  const turns: Turn[] = []
  const phases: ReadonlyArray<readonly ['ban' | 'pick', string]> = [
    ['ban', banTpl],
    ['pick', pickTpl],
  ]
  for (const [action, tpl] of phases) {
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
 */
export function buildSequence(preset: Preset, firstSide: Side): Step[] {
  const turns = buildTurns(preset, firstSide)
  const steps: Step[] = []
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
  const actions = steps.map((s) => s.action)
  const lastBan = actions.lastIndexOf('ban')
  const lastPick = actions.lastIndexOf('pick')
  for (const i of [lastBan, lastPick]) {
    const step = steps[i]
    if (i >= 0 && step && step.isLastOfTurn) step.isLastOfAction = true
  }
  return steps
}

/** 座位 ↔ 步号：把该方所有 ban 步、pick 步分别按顺序取第 `slot` 个（slot 从 1 起） */
export function seatSteps(
  steps: readonly Step[],
  side: Side,
  slot: number,
): { ban: number; pick: number } {
  const ban: number[] = []
  const pick: number[] = []
  steps.forEach((s, i) => {
    if (s.side !== side) return
    if (s.action === 'ban') ban.push(i)
    else pick.push(i)
  })
  return { ban: ban[slot - 1] ?? -1, pick: pick[slot - 1] ?? -1 }
}
