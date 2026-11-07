// 数据驱动整局走查（第 7 课 7.11）。
//
// 与 check-draft.mjs 的分工：
//   check-draft.mjs   纯规则层，假英雄，可直接 `node` 跑；
//   本脚本            真实 133 条数据 + 完整一局，必须经 Vite 管道加载
//                    （heroes.json 在 Node 原生 ESM 下不能直接 import）。
//
// 用法：npm run check:reducer
import { createServer } from 'vite'

let passed = 0
let failed = 0
function check(label, fn) {
  try {
    fn()
    passed += 1
    console.log(`  PASS  ${label}`)
  } catch (err) {
    failed += 1
    console.log(`  FAIL  ${label}`)
    console.log(`        ${err.message.split('\n')[0]}`)
  }
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const { allHeroes } = await server.ssrLoadModule('/src/data/heroes.js')
const { createDraft, draftReducer, derive, MY_STEPS, STEPS } = await server.ssrLoadModule(
  '/src/game/draft.js',
)

// 固定种子的伪随机：让两遍复跑完全一致
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const idsOf = (s) => [...s.banned, ...s.bluePicks, ...s.redPicks].map((h) => h.id)

/**
 * 走完一整局：我的两步手动 choose（取第一个可用），其余 auto。
 * 每步都校验不变量，越界立刻抛错。
 */
function play(seed) {
  const rand = mulberry32(seed)
  let s = createDraft()
  let myLands = 0
  const phases = []

  for (let guard = 0; guard < 80 && s.stepIndex < STEPS.length; guard++) {
    const d = derive(s)
    phases.push(d.phase)
    const expected = { epoch: s.epoch, stepIndex: s.stepIndex }

    if (d.isMyTurn) {
      const used = new Set(idsOf(s))
      const hero = allHeroes.find((h) => !used.has(h.id))
      const next = draftReducer(s, { type: 'choose', hero, expected })
      if (next === s) throw new Error(`我的步 choose 被拒（step ${s.stepIndex}）`)
      myLands += 1
      s = next
    } else {
      const next = draftReducer(s, { type: 'auto', heroes: allHeroes, random: rand(), expected })
      if (next === s) throw new Error(`系统步 auto 被拒（step ${s.stepIndex}）`)
      s = next
    }

    const total = s.banned.length + s.bluePicks.length + s.redPicks.length
    if (total !== s.stepIndex) {
      throw new Error(`不变量破坏：stepIndex=${s.stepIndex} 但名单和为 ${total}`)
    }
    if (new Set(idsOf(s)).size !== total) throw new Error('三名单并集出现重复英雄')
    if (s.banned.length > 10) throw new Error(`禁用越界：${s.banned.length}`)
    if (s.bluePicks.length > 5) throw new Error(`蓝方越界：${s.bluePicks.length}`)
    if (s.redPicks.length > 5) throw new Error(`红方越界：${s.redPicks.length}`)
  }

  return { state: s, myLands, phases }
}

console.log('\n[1] 数据前置')
check('真实数据 133 条', () => {
  if (allHeroes.length !== 133) throw new Error(`实际 ${allHeroes.length}`)
})
check('顺序表 20 步，我的步号为 4 / 14', () => {
  if (STEPS.length !== 20) throw new Error(`实际 ${STEPS.length}`)
  if (MY_STEPS.ban !== 4 || MY_STEPS.pick !== 14) throw new Error(JSON.stringify(MY_STEPS))
})

console.log('\n[2] 完整一局')
const run1 = play(20261107)
check('走满 20 步且名单为 [10, 5, 5]', () => {
  const { state } = run1
  const got = [state.stepIndex, state.banned.length, state.bluePicks.length, state.redPicks.length]
  if (JSON.stringify(got) !== JSON.stringify([20, 10, 5, 5])) throw new Error(`实际 ${JSON.stringify(got)}`)
})
check('20 位英雄互不重复且都来自真实数据', () => {
  const ids = idsOf(run1.state)
  if (ids.length !== 20) throw new Error(`实际 ${ids.length}`)
  if (new Set(ids).size !== 20) throw new Error('存在重复')
  const known = new Set(allHeroes.map((h) => h.id))
  const bad = ids.filter((id) => !known.has(id))
  if (bad.length) throw new Error(`未知 id：${bad.join(',')}`)
})
check('我只落账 2 次（ban + pick）', () => {
  if (run1.myLands !== 2) throw new Error(`实际 ${run1.myLands}`)
})
check('阶段序列为前 10 ban、后 10 pick', () => {
  const expected = [...Array(10).fill('ban'), ...Array(10).fill('pick')]
  if (JSON.stringify(run1.phases) !== JSON.stringify(expected)) {
    throw new Error(`实际 ${run1.phases.join('')}`)
  }
})
check('完成后 phase = confirm、isFinished = true', () => {
  const d = derive(run1.state)
  if (d.phase !== 'confirm') throw new Error(`phase=${d.phase}`)
  if (!d.isFinished) throw new Error('isFinished=false')
  if (d.currentStep !== null) throw new Error('currentStep 应为 null')
})

console.log('\n[3] 复跑一致性')
const run2 = play(20261107)
check('同种子两遍结果完全相同', () => {
  if (JSON.stringify(run1.state) !== JSON.stringify(run2.state)) throw new Error('两次结果不一致')
})
const run3 = play(7)
check('不同种子产生不同对局（随机确实生效）', () => {
  if (JSON.stringify(run1.state) === JSON.stringify(run3.state)) throw new Error('两次完全相同，随机可能未生效')
})
check('换种子后同样满足 [20,10,5,5]', () => {
  const s = run3.state
  const got = [s.stepIndex, s.banned.length, s.bluePicks.length, s.redPicks.length]
  if (JSON.stringify(got) !== JSON.stringify([20, 10, 5, 5])) throw new Error(`实际 ${JSON.stringify(got)}`)
})

console.log('\n[4] 边界与防御')
check('走完后继续 auto 被拒', () => {
  const s = run1.state
  const next = draftReducer(s, {
    type: 'auto',
    heroes: allHeroes,
    random: 0.5,
    expected: { epoch: s.epoch, stepIndex: s.stepIndex },
  })
  if (next !== s) throw new Error('拒绝失效')
})
check('走完后继续 choose 被拒', () => {
  const s = run1.state
  const next = draftReducer(s, {
    type: 'choose',
    hero: allHeroes[0],
    expected: { epoch: s.epoch, stepIndex: s.stepIndex },
  })
  if (next !== s) throw new Error('拒绝失效')
})
check('旧步令牌的 auto 被拒', () => {
  const mid = play(20261107)
  const stale = { epoch: mid.state.epoch, stepIndex: 0 }
  const next = draftReducer(mid.state, { type: 'auto', heroes: allHeroes, random: 0.5, expected: stale })
  if (next !== mid.state) throw new Error('旧令牌竟然生效')
})
check('重置后旧局令牌全部失效', () => {
  const mid = play(20261107)
  const stale = { epoch: mid.state.epoch, stepIndex: mid.state.stepIndex }
  const reset = draftReducer(mid.state, { type: 'reset' })
  if (reset.epoch !== mid.state.epoch + 1) throw new Error('epoch 未递增')
  const next = draftReducer(reset, { type: 'auto', heroes: allHeroes, random: 0.5, expected: stale })
  if (next !== reset) throw new Error('旧局令牌竟然生效')
})

console.log('\n[附] 本局结果（种子 20261107）')
console.log('  禁用：', run1.state.banned.map((h) => h.name).join(' / '))
console.log('  蓝方：', run1.state.bluePicks.map((h) => h.name).join(' / '))
console.log('  红方：', run1.state.redPicks.map((h) => h.name).join(' / '))

await server.close()
console.log(`\n结果：${passed}/${passed + failed} 通过`)
process.exit(failed ? 1 : 0)
