// 顺序表断言（2.8 验收）：纯函数，直接 node 跑，不需要浏览器。
// 用法：npm run check:sequence
import { buildSequence, buildTurns } from '../src/rules/sequence.js'

const failures = []
const check = (ok, label, detail = '') => {
  if (ok) console.log(`  PASS  ${label}`)
  else {
    failures.push(label + (detail ? ` → ${detail}` : ''))
    console.log(`  FAIL  ${label}${detail ? ` → ${detail}` : ''}`)
  }
}
const sidesOf = (steps) => steps.map((s) => (s.side === 'blue' ? 'B' : 'R')).join('')
const actionsOf = (steps) => steps.map((s) => s.action).join(',')

// ── 标准征召 / 蓝方先手 ──
console.log('\n[1] 标准 · 蓝先手')
const std = buildSequence('standard', 'blue')
const stdTurns = buildTurns('standard', 'blue')
check(std.length === 20, '共 20 步', String(std.length))
check(std.slice(0, 10).every((s) => s.action === 'ban'), '前 10 步全是 ban')
check(std.slice(10).every((s) => s.action === 'pick'), '后 10 步全是 pick')
check(sidesOf(std.slice(0, 10)) === 'BRBRBRBRBR', 'ban 段蓝红交替', sidesOf(std.slice(0, 10)))
check(std.filter((s) => s.side === 'blue').length === 10, '蓝方共 10 步')
check(std.filter((s) => s.side === 'red').length === 10, '红方共 10 步')
check(sidesOf(std.slice(10)) === 'BRRBBRRBBR', 'pick 段节奏 蓝红红蓝蓝红红蓝蓝红', sidesOf(std.slice(10)))

console.log('\n[2] 轮次分组（同队连选的 2 步属同一轮）')
const pickTurns = stdTurns.filter((t) => t.action === 'pick')
check(stdTurns.filter((t) => t.action === 'ban').length === 10, 'ban 段 10 轮，每轮 1 位')
check(pickTurns.map((t) => t.count).join() === '1,2,2,2,2,1', 'pick 段轮次计数 1/2/2/2/2/1', pickTurns.map((t) => t.count).join())
check(pickTurns.map((t) => t.side).join() === 'blue,red,blue,red,blue,red', 'pick 段轮次归属', pickTurns.map((t) => t.side).join())
check(stdTurns.length === 16, '共 16 轮（10 ban + 6 pick）', String(stdTurns.length))
check(pickTurns.reduce((n, t) => n + t.count, 0) === 10, 'pick 轮次合计 10 位')

console.log('\n[3] 每步的轮次标记')
check(
  std.every((s, i) => (i === 0 ? s.turnIndex === 0 : s.turnIndex >= std[i - 1].turnIndex)),
  'turnIndex 单调不减',
)
const turnGroups = new Map()
std.forEach((s) => {
  const key = s.turnIndex
  if (!turnGroups.has(key)) turnGroups.set(key, [])
  turnGroups.get(key).push(s)
})
check([...turnGroups.values()].every((g) => new Set(g.map((s) => s.side)).size === 1), '同一轮内不会跨方')
check(
  [...turnGroups.values()].every((g) => g.every((s, k) => s.indexInTurn === k && s.turnSize === g.length)),
  '轮内序号与轮大小自洽',
)
check(
  [...turnGroups.values()].every((g) => g[0].isFirstOfTurn && !g[0].isLastOfTurn === g.length > 1),
  'isFirstOfTurn / isLastOfTurn 正确',
)
check(std.filter((s) => s.isLastOfAction).length === 2, '两个阶段各标记 1 个收尾步', String(std.filter((s) => s.isLastOfAction).length))

// ── 标准征召 / 红方先手 ──
console.log('\n[4] 标准 · 红先手')
const red = buildSequence('standard', 'red')
const redTurns = buildTurns('standard', 'red').filter((t) => t.action === 'pick')
check(red.length === 20, '共 20 步')
check(red[0].side === 'red' && red[0].action === 'ban', '第 1 步是红方 ban')
check(red[10].side === 'red' && red[10].action === 'pick', '第 11 步是红方 pick')
check(sidesOf(red.slice(10)) === 'RBBRRBBRRB', 'pick 段节奏随之镜像', sidesOf(red.slice(10)))
check(redTurns.map((t) => `${t.side}${t.count}`).join() === 'red1,blue2,red2,blue2,red2,blue1', '红先手的轮次归属镜像', redTurns.map((t) => `${t.side}${t.count}`).join())

// ── 简单交替 ──
console.log('\n[5] 简单交替 · 蓝先手')
const simple = buildSequence('simple', 'blue')
const simplePickTurns = buildTurns('simple', 'blue').filter((t) => t.action === 'pick')
check(simple.length === 20, '共 20 步')
check(sidesOf(simple.slice(10)) === 'BRBRBRBRBR', 'pick 段为纯交替')
check(simplePickTurns.every((t) => t.count === 1), '简单模式下每轮只有 1 位（无同队连选）')

// ── 非法入参 ──
console.log('\n[6] 非法入参')
const throws = (fn) => {
  try {
    fn()
    return false
  } catch {
    return true
  }
}
check(throws(() => buildTurns('unknown', 'blue')), 'preset 非法时抛错')
check(throws(() => buildTurns('standard', 'purple')), 'firstSide 非法时抛错')

console.log('\n[附] 20 步全表（标准 · 蓝先手）')
std.forEach((s, i) =>
  console.log(
    `  ${String(i + 1).padStart(2, '0')}  ${s.action === 'ban' ? '禁' : '选'}  ${s.side === 'blue' ? '蓝' : '红'}  轮${s.turnIndex}  第${s.indexInTurn + 1}/${s.turnSize}位`,
  ),
)

console.log('')
if (failures.length) {
  console.error(`✗ 失败 ${failures.length} 项：`)
  failures.forEach((f) => console.error(`  - ${f}`))
  process.exit(1)
}
console.log(`✓ 全部通过（${actionsOf(std).split(',').length} 步 / ${stdTurns.length} 轮）`)
